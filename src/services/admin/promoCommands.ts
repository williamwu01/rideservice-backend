import { prisma } from "../../lib/prisma";
import { sendTextMessage } from "../whatsapp";
import { createPromoCode, disablePromoCode, listPromoCodes } from "../promo";

export async function handlePromoCommand(phone: string, parts: string[]) {
  const lower = parts.join(" ").toLowerCase();

  // List Promocodes
  if (lower === "list promocodes") {
    const promos = await listPromoCodes();
    if (promos.length === 0) {
      await sendTextMessage(phone, "No promo codes found.");
      return;
    }
    const lines = promos.map(
      (p: typeof promos[0]) =>
        `${p.isActive ? "✅" : "❌"} *${p.code}* — $${p.discount.toFixed(2)} off | Used: ${p.usedCount}${p.maxUses ? `/${p.maxUses}` : ""}${p.expiresAt ? ` | Expires: ${p.expiresAt.toDateString()}` : ""}`
    );
    await sendTextMessage(phone, `📋 Promo Codes:\n\n${lines.join("\n")}`);
    return;
  }

  // Disable Promocode <CODE>
  if (lower.startsWith("disable promocode")) {
    if (parts.length < 3) {
      await sendTextMessage(phone, "❌ Usage: Disable Promocode <CODE>");
      return;
    }
    try {
      await disablePromoCode(parts[2]);
      await sendTextMessage(phone, `✅ Promo code *${parts[2].toUpperCase()}* has been disabled.`);
    } catch (err: any) {
      await sendTextMessage(phone, `❌ ${err.message}`);
    }
    return;
  }

  // Create Promocode <amount>
  // Create Promocode <amount> uses <limit>
  // Create Promocode <CODE> <amount>
  // Create Promocode <CODE> <amount> uses <limit>
  if (lower.startsWith("create promocode")) {
    if (parts.length < 3) {
      await sendTextMessage(phone, "❌ Usage: Create Promocode <amount>  OR  Create Promocode <CODE> <amount>");
      return;
    }

    let code: string | undefined;
    let discount: number;
    let maxUses: number | undefined;

    const usesIndex = parts.findIndex((p) => p.toLowerCase() === "uses");
    if (usesIndex !== -1) {
      maxUses = parseInt(parts[usesIndex + 1]);
      if (isNaN(maxUses) || maxUses <= 0) {
        await sendTextMessage(phone, "❌ Invalid uses amount. Example: Create Promocode 10 uses 50");
        return;
      }
      parts.splice(usesIndex, 2);
    }

    if (parts.length === 3) {
      discount = parseFloat(parts[2]);
    } else {
      code = parts[2].toUpperCase();
      discount = parseFloat(parts[3]);
    }

    if (isNaN(discount) || discount <= 0) {
      await sendTextMessage(phone, "❌ Invalid amount. Example: Create Promocode 10.00");
      return;
    }

    try {
      const admin = await prisma.admin.findUnique({ where: { phone } });
      const promo = await createPromoCode(discount, admin!.name, { code, maxUses });
      const usesLine = maxUses ? `\nMax uses: ${maxUses}` : "\nMax uses: Unlimited";
      await sendTextMessage(
        phone,
        `✅ Promo code created!\n\nCode: *${promo.code}*\nDiscount: $${promo.discount.toFixed(2)} off${usesLine}\n\nShare this code with your customer.`
      );
    } catch (err: any) {
      await sendTextMessage(phone, `❌ ${err.message}`);
    }
    return;
  }
}