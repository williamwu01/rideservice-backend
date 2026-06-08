import { prisma } from "../../lib/prisma";
import { sendTextMessage } from "../whatsapp";

const FIELD_MAP: Record<string, string> = {
  base: "baseFare",
  km: "perKm",
  min: "perMin",
  booking: "bookingFee",
  minimum: "minimumFare",
  airport: "airportFee",
  latenight: "lateNightFee",
};

async function getActiveRates() {
  return prisma.pricingConfig.findFirst({ where: { isActive: true } });
}

export async function handlePricingCommand(phone: string, parts: string[]) {
  const sub = parts[2]?.toLowerCase();

  // ADMIN PRICE SHOW
  if (sub === "show") {
    const rates = await getActiveRates();
    if (!rates) {
      await sendTextMessage(phone, "⚠️ No active pricing profile. Using hardcoded defaults.");
      return;
    }
    await sendTextMessage(
      phone,
      `📊 *Active Pricing: ${rates.name}*\n\n` +
      `Base fare:     $${rates.baseFare.toFixed(2)}\n` +
      `Per km:        $${rates.perKm.toFixed(2)}\n` +
      `Per min:       $${rates.perMin.toFixed(2)}\n` +
      `Booking fee:   $${rates.bookingFee.toFixed(2)}\n` +
      `Minimum fare:  $${rates.minimumFare.toFixed(2)}\n` +
      `Airport fee:   $${rates.airportFee.toFixed(2)}\n` +
      `Late night:    $${rates.lateNightFee.toFixed(2)}`
    );
    return;
  }

  // ADMIN PRICE SET <field> <value>
  if (sub === "set") {
    const field = parts[3]?.toLowerCase();
    const value = parseFloat(parts[4]);

    if (!field || isNaN(value) || value < 0) {
      await sendTextMessage(
        phone,
        "❌ Usage: ADMIN PRICE SET <field> <value>\n\nFields: base, km, min, booking, minimum, airport, latenight"
      );
      return;
    }

    const dbField = FIELD_MAP[field];
    if (!dbField) {
      await sendTextMessage(phone, `❌ Unknown field: ${field}\n\nValid fields: base, km, min, booking, minimum, airport, latenight`);
      return;
    }

    const rates = await getActiveRates();
    if (!rates) {
      await sendTextMessage(phone, "❌ No active pricing profile. Activate one first: ADMIN PRICE ACTIVATE <name>");
      return;
    }

    await prisma.pricingConfig.update({
      where: { id: rates.id },
      data: { [dbField]: value },
    });

    await sendTextMessage(phone, `✅ *${rates.name}* updated\n${field} → $${value.toFixed(2)}`);
    return;
  }

  // ADMIN PRICE CREATE <name>  — creates a new profile with default rates and activates it
  if (sub === "create") {
    const name = parts[3]?.toLowerCase();
    if (!name) {
      await sendTextMessage(phone, "❌ Usage: ADMIN PRICE CREATE <name>");
      return;
    }

    const existing = await prisma.pricingConfig.findUnique({ where: { name } });
    if (existing) {
      await sendTextMessage(phone, `❌ Profile "${name}" already exists. Use ADMIN PRICE ACTIVATE ${name} to enable it.`);
      return;
    }

    await prisma.pricingConfig.updateMany({ data: { isActive: false } });
    const profile = await prisma.pricingConfig.create({
      data: {
        name,
        baseFare: 2.75,
        perKm: 1.50,
        perMin: 0.36,
        bookingFee: 2.00,
        minimumFare: 8.00,
        airportFee: 5.00,
        lateNightFee: 3.00,
        isActive: true,
      },
    });

    await sendTextMessage(
      phone,
      `✅ Pricing profile *${profile.name}* created and activated!\n\n` +
      `Base: $${profile.baseFare.toFixed(2)} | Per km: $${profile.perKm.toFixed(2)} | Per min: $${profile.perMin.toFixed(2)}\n` +
      `Booking fee: $${profile.bookingFee.toFixed(2)} | Minimum: $${profile.minimumFare.toFixed(2)}\n\n` +
      `Use ADMIN PRICE SET <field> <value> to adjust.`
    );
    return;
  }

  // ADMIN PRICE ACTIVATE <name>
  if (sub === "activate") {
    const name = parts[3]?.toLowerCase();
    if (!name) {
      await sendTextMessage(phone, "❌ Usage: ADMIN PRICE ACTIVATE <name>");
      return;
    }

    const profile = await prisma.pricingConfig.findUnique({ where: { name } });
    if (!profile) {
      await sendTextMessage(phone, `❌ Pricing profile "${name}" not found.\n\nUse ADMIN PRICE LIST to see available profiles.`);
      return;
    }

    // Deactivate all, then activate the chosen one
    await prisma.pricingConfig.updateMany({ data: { isActive: false } });
    await prisma.pricingConfig.update({ where: { name }, data: { isActive: true } });

    await sendTextMessage(
      phone,
      `✅ *${profile.name}* pricing activated!\n\n` +
      `Base: $${profile.baseFare.toFixed(2)} | Per km: $${profile.perKm.toFixed(2)} | Per min: $${profile.perMin.toFixed(2)}\n\n` +
      `All new estimates will use these rates immediately.`
    );
    return;
  }

  // ADMIN PRICE LIST
  if (sub === "list") {
    const profiles = await prisma.pricingConfig.findMany({ orderBy: { name: "asc" } });
    if (profiles.length === 0) {
      await sendTextMessage(phone, "No pricing profiles found. Add them in Supabase.");
      return;
    }
    const lines = profiles.map(
      (p: typeof profiles[0]) => `${p.isActive ? "🟢" : "⚪"} *${p.name}* — base $${p.baseFare.toFixed(2)}, $${p.perKm.toFixed(2)}/km`
    );
    await sendTextMessage(phone, `📋 Pricing Profiles:\n\n${lines.join("\n")}`);
    return;
  }

  // Help
  await sendTextMessage(
    phone,
    `💰 *Pricing Commands*\n\n` +
    `ADMIN PRICE CREATE <name>\n` +
    `ADMIN PRICE SHOW\n` +
    `ADMIN PRICE LIST\n` +
    `ADMIN PRICE ACTIVATE <name>\n` +
    `ADMIN PRICE SET base 5.00\n` +
    `ADMIN PRICE SET km 2.00\n` +
    `ADMIN PRICE SET min 0.45\n` +
    `ADMIN PRICE SET booking 3.00\n` +
    `ADMIN PRICE SET minimum 10.00\n` +
    `ADMIN PRICE SET airport 7.00\n` +
    `ADMIN PRICE SET latenight 4.00`
  );
}
