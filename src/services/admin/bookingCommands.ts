import { sendTextMessage } from "../whatsapp";
import { adminConfirmBooking, adminDeclineBooking } from "../booking";

export async function handleBookingCommand(phone: string, parts: string[]) {
  const command = parts[0]?.toUpperCase();
  const bookingId = parts[1];

  if (!bookingId) {
    await sendTextMessage(phone, "Usage:\nCONFIRM <bookingId>\nDECLINE <bookingId>");
    return;
  }

  try {
    if (command === "CONFIRM") {
      const result = await adminConfirmBooking(bookingId);
      const reply = result.scheduled
        ? `✅ Booking ${bookingId} confirmed.\nScheduled for ${result.timeLabel} — driver will be dispatched closer to pickup.`
        : `✅ Booking ${bookingId} confirmed.\nBest available driver proposed to customer — waiting for their confirmation.`;
      await sendTextMessage(phone, reply);
    } else if (command === "DECLINE") {
      await adminDeclineBooking(bookingId);
      await sendTextMessage(phone, `❌ Booking ${bookingId} declined. Customer has been notified.`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await sendTextMessage(phone, `❌ Error: ${msg}`);
  }
}
