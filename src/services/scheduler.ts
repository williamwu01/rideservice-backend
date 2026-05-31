import { prisma } from "../lib/prisma";
import { config } from "../config/env";
import { selectAndProposeDriver } from "./booking";
import { sendTextMessage } from "./whatsapp";

const WEB_RESERVATION_MS   = 5  * 60 * 1000; // Path A: 5 min
const WA_PENDING_MS        = 30 * 60 * 1000; // Path B PENDING: 30 min
const WA_AWAITING_ADMIN_MS = 24 * 60 * 60 * 1000; // Path B AWAITING_ADMIN: 24 hr

/**
 * Cancel stale bookings for both paths.
 * Web bookings (phone has no @) expire after 5 min of PENDING.
 * WhatsApp bookings (phone has @c.us) expire after 60 min PENDING or 24 hr AWAITING_ADMIN.
 */
async function cancelStaleBookings() {
  const now = Date.now();

  // Path A — web reservations not paid within 5 min
  const webCancelled = await prisma.rideRequest.updateMany({
    where: {
      status: "PENDING",
      paymentStatus: "PENDING",
      phone: { not: { contains: "@" } },
      createdAt: { lt: new Date(now - WEB_RESERVATION_MS) },
    },
    data: { status: "CANCELLED" },
  });

  // Path B — WhatsApp PENDING (driver proposed/confirmed, no payment) older than 60 min
  const waPendingCancelled = await prisma.rideRequest.updateMany({
    where: {
      status: "PENDING",
      paymentStatus: { not: "PAID" },
      phone: { contains: "@" },
      createdAt: { lt: new Date(now - WA_PENDING_MS) },
    },
    data: { status: "CANCELLED" },
  });

  // Path B — WhatsApp AWAITING_ADMIN older than 24 hr (admin never responded)
  const waAdminCancelled = await prisma.rideRequest.updateMany({
    where: {
      status: "AWAITING_ADMIN",
      phone: { contains: "@" },
      createdAt: { lt: new Date(now - WA_AWAITING_ADMIN_MS) },
    },
    data: { status: "CANCELLED" },
  });

  const total = webCancelled.count + waPendingCancelled.count + waAdminCancelled.count;
  if (total > 0) {
    console.log(`[scheduler] cancelled stale bookings — web:${webCancelled.count} wa_pending:${waPendingCancelled.count} wa_admin:${waAdminCancelled.count}`);
  }
}

/**
 * Check for SCHEDULED rides whose pickup time is within the dispatch window
 * and flip them to PENDING so drivers get notified.
 */
export async function processScheduledRides() {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + config.scheduleDispatchWindowMinutes * 60 * 1000);

  const upcoming = await prisma.rideRequest.findMany({
    where: {
      status: "SCHEDULED",
      scheduledPickupAt: { lte: windowEnd },
    },
  });

  for (const ride of upcoming) {
    try {
      await prisma.rideRequest.update({
        where: { id: ride.id },
        data: { status: "PENDING" },
      });

      // Let customer know we're on it
      await sendTextMessage(
        ride.phone,
        `Your scheduled ride is coming up soon! We're now finding you a driver — we'll let you know when one accepts.`
      ).catch(() => {/* non-fatal */});

      await selectAndProposeDriver(ride.id);
      console.log(`[scheduler] dispatched scheduled ride ${ride.id}`);
    } catch (err) {
      console.error(`[scheduler] failed to process ride ${ride.id}:`, err);
    }
  }
}

/**
 * Start the background scheduler. Runs every 60 seconds.
 */
export function startScheduler() {
  const tick = () => {
    processScheduledRides().catch((err) => console.error("[scheduler] dispatch error:", err));
    cancelStaleBookings().catch((err) => console.error("[scheduler] cleanup error:", err));
  };

  // Run once immediately in case the server restarted mid-window
  tick();

  setInterval(tick, 60_000);

  console.log(
    `[scheduler] started — dispatching scheduled rides ${config.scheduleDispatchWindowMinutes} min before pickup`
  );
}
