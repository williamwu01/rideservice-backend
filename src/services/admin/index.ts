import { prisma } from "../../lib/prisma";
import { sendTextMessage } from "../whatsapp";
import { handlePromoCommand } from "./promoCommands";
import { handlePricingCommand } from "./pricingCommands";

export async function isAdmin(phone: string): Promise<boolean> {
  const admin = await prisma.admin.findUnique({ where: { phone } });
  return !!admin;
}

export async function handleAdminCommand(phone: string, text: string) {
  const parts = text.trim().split(/\s+/);
  const lower = text.trim().toLowerCase();

  // Promo commands
  if (
    lower.startsWith("create promocode") ||
    lower.startsWith("disable promocode") ||
    lower === "list promocodes"
  ) {
    await handlePromoCommand(phone, parts);
    return;
  }

  // Help triggers
  if (lower === "help" || lower === "more info") {
    await sendTextMessage(
      phone,
      `🤖 *Admin Commands*\n\n` +
      `*💰 Pricing:*\n` +
      `ADMIN PRICE SHOW\n` +
      `ADMIN PRICE LIST\n` +
      `ADMIN PRICE ACTIVATE <name>\n` +
      `ADMIN PRICE SET <field> <value>\n\n` +
      `*🎟 Promo Codes:*\n` +
      `Create Promocode <amount>\n` +
      `Create Promocode <amount> uses <limit>\n` +
      `Create Promocode <CODE> <amount>\n` +
      `Create Promocode <CODE> <amount> uses <limit>\n` +
      `Disable Promocode <CODE>\n` +
      `List Promocodes`
    );
    return;
  }

  // Pricing commands
  if (lower.startsWith("admin price")) {
    await handlePricingCommand(phone, parts);
    return;
  }

  // Help — show all available commands
  await sendTextMessage(
    phone,
    `🤖 *Admin Commands*\n\n` +
    `*💰 Pricing:*\n` +
    `ADMIN PRICE SHOW\n` +
    `ADMIN PRICE LIST\n` +
    `ADMIN PRICE ACTIVATE <name>\n` +
    `ADMIN PRICE SET <field> <value>\n\n` +
    `*🎟 Promo Codes:*\n` +
    `Create Promocode <amount>\n` +
    `Create Promocode <amount> uses <limit>\n` +
    `Create Promocode <CODE> <amount>\n` +
    `Create Promocode <CODE> <amount> uses <limit>\n` +
    `Disable Promocode <CODE>\n` +
    `List Promocodes`
  );
}
