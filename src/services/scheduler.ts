import { prisma } from "../lib/prisma";
import { config } from "../config/env";
import { selectAndProposeDriver } from "./booking";
import { sendTextMessage } from "./whatsapp";

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
  // Run once immediately in case the server restarted mid-window
  processScheduledRides().catch((err) =>
    console.error("[scheduler] initial run error:", err)
  );

  setInterval(() => {
    processScheduledRides().catch((err) =>
      console.error("[scheduler] error:", err)
    );
  }, 60_000);

  console.log(
    `[scheduler] started — dispatching scheduled rides ${config.scheduleDispatchWindowMinutes} min before pickup`
  );
}
