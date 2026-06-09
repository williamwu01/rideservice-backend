import { prisma } from "../../lib/prisma";
import { sendTextMessage } from "../whatsapp";
import { handlePromoCommand } from "./promoCommands";
import { handlePricingCommand } from "./pricingCommands";
import { handleBookingCommand } from "./bookingCommands";

export async function isAdmin(phone: string): Promise<boolean> {
  const admin = await prisma.admin.findUnique({ where: { phone } });
  return !!admin;
}

export async function handleAdminCommand(phone: string, text: string) {
  const parts = text.trim().split(/\s+/);
  const lower = text.trim().toLowerCase();

  // Booking approval commands
  if (lower.startsWith("confirm ") || lower.startsWith("decline ")) {
    await handleBookingCommand(phone, parts);
    return;
  }

  // Promo commands
  if (
    lower.startsWith("create promocode") ||
    lower.startsWith("disable promocode") ||
    lower === "list promocodes"
  ) {
    await handlePromoCommand(phone, parts);
    return;
  }

  // Pricing commands
  if (lower.startsWith("admin price")) {
    await handlePricingCommand(phone, parts);
    return;
  }

  // Help menu
  await sendTextMessage(
    phone,
    `*Admin Commands*\n\n` +
    `*Bookings:*\n` +
    `CONFIRM <4-digit code>\n` +
    `DECLINE <4-digit code>\n\n` +
    `*Pricing:*\n` +
    `ADMIN PRICE SHOW\n` +
    `ADMIN PRICE LIST\n` +
    `ADMIN PRICE ACTIVATE <name>\n` +
    `ADMIN PRICE SET <field> <value>\n\n` +
    `*Promo Codes:*\n` +
    `Create Promocode <amount>\n` +
    `Create Promocode <CODE> <amount> uses <limit>\n` +
    `Disable Promocode <CODE>\n` +
    `List Promocodes`
  );
}
