import { Client, LocalAuth, Message } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";

let client: Client | null = null;
let isStarting = false;

export async function startWhatsApp() {
  if (isStarting || client) return;
  isStarting = true;

  client = new Client({
    authStrategy: new LocalAuth({
      dataPath: "whatsapp-session",
    }),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });

  client.on("qr", (qr) => {
    console.log("\n📱 Scan this QR code with WhatsApp:\n");
    qrcode.generate(qr, { small: true });
  });

  client.on("ready", () => {
    isStarting = false;
    console.log("✅ WhatsApp connected!");
  });

  client.on("disconnected", (reason) => {
    console.log("WhatsApp disconnected:", reason);
    client = null;
    isStarting = false;
    if (reason === "LOGOUT") {
      console.log("Logged out — delete the whatsapp-session folder and restart to re-scan QR.");
      return;
    }
    setTimeout(startWhatsApp, 5000);
  });

  // Fire for messages received
  client.on("message", async (msg: Message) => {
    console.log(`[message] from=${msg.from} body="${msg.body}" fromMe=${msg.fromMe}`);
    if (msg.from.endsWith("@g.us")) return;
    // Preserve the full JID (may be a LID like 61242056171708@c.us) as the key
    const jid = msg.from; // e.g. "61412345678@c.us" or "61242056171708@c.us"
    const text = msg.body;
    if (!jid || !text) return;
    const { handleIncomingMessage } = await import("./conversation");
    await handleIncomingMessage(jid, text);
  });

  // Fire for ALL messages including sent — helps debug
  client.on("message_create", (msg: Message) => {
    console.log(`[message_create] from=${msg.from} to=${msg.to} body="${msg.body}" fromMe=${msg.fromMe}`);
  });

  await client.initialize();
}

export async function sendTextMessage(phone: string, text: string) {
  if (!client) throw new Error("WhatsApp not connected");

  // phone may be a full JID (from msg.from like "61242056171708@c.us")
  // or a plain phone number from the frontend ("61412345678")
  let jid: string;
  if (phone.includes("@")) {
    // Already a JID — use directly (handles LID accounts)
    jid = phone;
  } else {
    // Plain phone number from frontend — resolve via WhatsApp to get proper ID
    const digits = phone.replace(/\D/g, "");
    const numberId = await client.getNumberId(digits);
    if (!numberId) {
      console.error(`[sendTextMessage] ${digits} is not registered on WhatsApp — skipping`);
      return;
    }
    jid = numberId._serialized;
  }

  console.log(`[sendTextMessage] sending to ${jid}`);
  await client.sendMessage(jid, text);
  console.log(`[sendTextMessage] sent OK to ${jid}`);
}
