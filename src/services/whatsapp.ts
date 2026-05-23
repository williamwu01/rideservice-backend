import { Client, LocalAuth, Message } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";

let client: Client | null = null;

export async function startWhatsApp() {
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
    console.log("✅ WhatsApp connected!");
  });

  client.on("disconnected", (reason) => {
    console.log("WhatsApp disconnected:", reason);
    client = null;
    setTimeout(startWhatsApp, 5000);
  });

  // Fire for messages received
  client.on("message", async (msg: Message) => {
    console.log(`[message] from=${msg.from} body="${msg.body}" fromMe=${msg.fromMe}`);
    if (msg.from.endsWith("@g.us")) return;
    const phone = msg.from.replace("@c.us", "").replace(/\D/g, "");
    const text = msg.body;
    if (!phone || !text) return;
    const { handleIncomingMessage } = await import("./conversation");
    await handleIncomingMessage(phone, text);
  });

  // Fire for ALL messages including sent — helps debug
  client.on("message_create", (msg: Message) => {
    console.log(`[message_create] from=${msg.from} to=${msg.to} body="${msg.body}" fromMe=${msg.fromMe}`);
  });

  await client.initialize();
}

export async function sendTextMessage(phone: string, text: string) {
  if (!client) throw new Error("WhatsApp not connected");
  const jid = `${phone.replace(/\D/g, "")}@c.us`;
  console.log(`[sendTextMessage] sending to ${jid}`);
  await client.sendMessage(jid, text);
  console.log(`[sendTextMessage] sent OK to ${jid}`);
}
