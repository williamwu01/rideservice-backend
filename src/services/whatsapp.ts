import { Client, LocalAuth, Message, MessageMedia } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";

let client: Client | null = null;
let isStarting = false;
let startAttempts = 0;

// Exponential backoff: 5s, 15s, 30s, 60s, 120s then give up
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000, 120_000];

const MAX_MESSAGE_LENGTH = 2_000;

// Dev-mode outbox: captures messages during simulation so nothing real is sent
const devOutbox: { to: string; body: string; sentAt: string }[] = [];
let simulationMode = false;

export function enableSimulationMode() { simulationMode = true; }
export function disableSimulationMode() { simulationMode = false; }

export function flushDevOutbox() {
  return devOutbox.splice(0, devOutbox.length);
}

export async function startWhatsApp() {
  if (isStarting || client) return;
  if (startAttempts >= RETRY_DELAYS_MS.length) {
    console.error(`❌ WhatsApp: Max startup attempts (${RETRY_DELAYS_MS.length}) reached. Giving up.`);
    return;
  }

  isStarting = true;
  startAttempts++;

  try {
    console.log(`[WhatsApp] Starting... (attempt ${startAttempts}/${RETRY_DELAYS_MS.length})`);

    client = new Client({
      authStrategy: new LocalAuth({ dataPath: "whatsapp-session" }),
      puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      },
    });

    client.on("qr", (qr) => {
      console.log("\n📱 Scan this QR code with WhatsApp:\n");
      qrcode.generate(qr, { small: true });
    });

    client.on("ready", () => {
      isStarting = false;
      startAttempts = 0;
      console.log("✅ WhatsApp connected!");
    });

    client.on("disconnected", (reason) => {
      console.warn(`⚠️  WhatsApp disconnected: ${reason}`);
      client = null;
      isStarting = false;

      if (reason === "LOGOUT") {
        console.log("User logged out — delete whatsapp-session and restart to re-scan QR.");
        startAttempts = RETRY_DELAYS_MS.length; // prevent retries
        return;
      }

      scheduleReconnect();
    });

    client.on("error", (error) => {
      console.error(`[WhatsApp] Client error:`, error);
    });

    client.on("message", async (msg: Message) => {
      // Ignore own messages and group chats
      if (msg.fromMe) return;
      if (msg.from.endsWith("@g.us")) return;

      // Guard against oversized payloads
      if (msg.body && msg.body.length > MAX_MESSAGE_LENGTH) {
        console.warn(`[message] Ignoring oversized message from ${msg.from} (${msg.body.length} chars)`);
        return;
      }

      try {
        const { config } = await import("../config/env");
        const senderId = msg.from.replace(/@.*/, "").replace(/\D/g, "");
        const cleanedBlockedPhones = config.blockedPhones.map((p) => p.replace(/\D/g, ""));
        if (cleanedBlockedPhones.includes(senderId)) return;

        const jid = msg.from;

        // Driver GPS location share
        if (msg.type === "location" && msg.location) {
          const { handleLocationMessage } = await import("./conversation");
          await handleLocationMessage(
            jid,
            parseFloat(msg.location.latitude as unknown as string),
            parseFloat(msg.location.longitude as unknown as string)
          );
          return;
        }

        const text = msg.body;
        if (!text) return;

        const { isAdmin, handleAdminCommand } = await import("./admin/index");
        const phone = jid.replace(/@.*/, "").replace(/\D/g, "");

        if (await isAdmin(phone)) {
          await handleAdminCommand(phone, text);
        } else {
          const { handleIncomingMessage } = await import("./conversation");
          await handleIncomingMessage(jid, text);
        }
      } catch (err) {
        console.error(`[message] Unhandled error from ${msg.from}:`, err);
        // Best-effort apology message — don't let this throw
        sendTextMessage(msg.from, "Sorry, something went wrong on our end. Please try again in a moment.").catch(() => {});
      }
    });

    await client.initialize();
  } catch (error) {
    isStarting = false;
    console.error(`❌ WhatsApp init failed (attempt ${startAttempts}/${RETRY_DELAYS_MS.length}):`, error);
    // Destroy before nullifying so the puppeteer browser process is killed and the
    // next retry doesn't fail with "browser already running for this userDataDir"
    await client?.destroy().catch(() => {});
    client = null;
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (startAttempts >= RETRY_DELAYS_MS.length) {
    console.error("❌ WhatsApp: Max reconnect attempts reached. Bot is disabled.");
    return;
  }
  const delay = RETRY_DELAYS_MS[startAttempts] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
  console.log(`[WhatsApp] Reconnecting in ${delay / 1000}s... (attempt ${startAttempts + 1}/${RETRY_DELAYS_MS.length})`);
  setTimeout(startWhatsApp, delay);
}

export async function sendTextMessage(phone: string, text: string) {
  if (!client || simulationMode) {
    const entry = { to: phone, body: text, sentAt: new Date().toISOString() };
    devOutbox.push(entry);
    console.log(`[sendTextMessage][sim] to=${phone}\n${text}\n`);
    return;
  }

  let jid: string;
  if (phone.includes("@")) {
    jid = phone;
  } else {
    // Construct JID directly — getNumberId only works for saved contacts and its
    // Puppeteer evaluation throws for non-contacts, destabilising the WA session
    jid = `${phone.replace(/\D/g, "")}@c.us`;
  }

  await client.sendMessage(jid, text);
}

export async function sendImageMessage(phone: string, imagePath: string, caption: string) {
  if (!client || simulationMode) {
    devOutbox.push({ to: phone, body: `[IMAGE] ${caption}`, sentAt: new Date().toISOString() });
    console.log(`[sendImageMessage][sim] to=${phone}\n${caption}\n`);
    return;
  }

  let jid: string;
  if (phone.includes("@")) {
    jid = phone;
  } else {
    jid = `${phone.replace(/\D/g, "")}@c.us`;
  }

  const media = MessageMedia.fromFilePath(imagePath);
  await client.sendMessage(jid, media, { caption });
}