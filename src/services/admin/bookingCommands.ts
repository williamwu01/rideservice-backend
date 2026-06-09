import { prisma } from "../../lib/prisma";
import { sendTextMessage } from "../whatsapp";
import { adminConfirmBooking, adminDeclineBooking } from "../booking";

export async function handleBookingCommand(phone: string, parts: string[]) {
  const command = parts[0]?.toUpperCase();
  const code = parts[1];

  if (!code) {
    await sendTextMessage(phone, "Usage:\nCONFIRM <4-digit code>\nDECLINE <4-digit code>");
    return;
  }

  // Resolve short code (last 4 chars) to full booking ID
  const booking = await prisma.rideRequest.findFirst({
    where: { id: { endsWith: code.toLowerCase() } },
    orderBy: { createdAt: "desc" },
  });

  if (!booking) {
    await sendTextMessage(phone, `❌ No booking found with code ${code.toUpperCase()}`);
    return;
  }

  try {
    if (command === "CONFIRM") {
      const result = await adminConfirmBooking(booking.id);
      const reply = result.scheduled
        ? `✅ Booking ${code.toUpperCase()} confirmed.\nScheduled for ${result.timeLabel} — driver will be dispatched closer to pickup.`
        : `✅ Booking ${code.toUpperCase()} confirmed.\nBest available driver proposed to customer — waiting for their confirmation.`;
      await sendTextMessage(phone, reply);
    } else if (command === "DECLINE") {
      await adminDeclineBooking(booking.id);
      await sendTextMessage(phone, `❌ Booking ${code.toUpperCase()} declined. Customer has been notified.`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await sendTextMessage(phone, `❌ Error: ${msg}`);
  }
}
