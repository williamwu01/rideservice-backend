import path from "path";
import { prisma } from "../lib/prisma";
import { sendTextMessage, sendImageMessage } from "./whatsapp";
import { config } from "../config/env";

type CreateBookingInput = {
  phone: string;
  firstName: string;
  lastName: string;
  pickup: string;
  destination: string;
  pickupTime?: string;
};

type BookingFilters = {
  status?: string;
  driverId?: string;
};

// ─── Create ─────────────────────────────────────────────────────────────────

export async function createBooking(data: CreateBookingInput) {
  const booking = await prisma.rideRequest.create({
    data: {
      phone: data.phone,
      firstName: data.firstName,
      lastName: data.lastName,
      pickup: data.pickup,
      destination: data.destination,
      pickupTime: data.pickupTime,
      status: "AWAITING_ADMIN",
    },
  });

  // Notify admin — fire and forget
  notifyAdmin(booking).catch((err) =>
    console.error("[createBooking] admin notification failed:", err)
  );

  return booking;
}

// ─── Admin notification ──────────────────────────────────────────────────────

async function notifyAdmin(booking: {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  pickup: string;
  destination: string;
  pickupTime?: string | null;
}) {
  if (!config.adminPhone) {
    console.warn("[booking] ADMIN_PHONE not set — skipping admin notification");
    return;
  }

  const message =
    `New ride request pending your approval!\n\n` +
    `Customer: ${booking.firstName} ${booking.lastName}\n` +
    `Phone: ${booking.phone}\n` +
    `Pickup: ${booking.pickup}\n` +
    `Destination: ${booking.destination}\n` +
    `Pickup Time: ${booking.pickupTime ?? "ASAP"}\n\n` +
    `Reply CONFIRM ${booking.id} to approve\n` +
    `Reply DECLINE ${booking.id} to reject`;

  await sendTextMessage(config.adminPhone, message);
}

// ─── Admin confirm / decline ─────────────────────────────────────────────────

export async function adminConfirmBooking(bookingId: string) {
  const booking = await prisma.rideRequest.findUnique({ where: { id: bookingId } });
  if (!booking) throw new Error(`Booking ${bookingId} not found`);
  if (booking.status !== "AWAITING_ADMIN") {
    throw new Error(`Booking is not awaiting admin approval (status: ${booking.status})`);
  }

  await prisma.rideRequest.update({
    where: { id: bookingId },
    data: { status: "PENDING" },
  });

  // Tell customer their booking was approved
  await sendTextMessage(
    booking.phone,
    `Your ride request has been approved! We're finding you a driver now. Please wait...`
  );

  // Dispatch to all drivers
  await dispatchToDrivers(bookingId);
}

export async function adminDeclineBooking(bookingId: string) {
  const booking = await prisma.rideRequest.findUnique({ where: { id: bookingId } });
  if (!booking) throw new Error(`Booking ${bookingId} not found`);
  if (booking.status !== "AWAITING_ADMIN") {
    throw new Error(`Booking is not awaiting admin approval (status: ${booking.status})`);
  }

  await prisma.rideRequest.update({
    where: { id: bookingId },
    data: { status: "CANCELLED" },
  });

  await sendTextMessage(
    booking.phone,
    `Sorry, we were unable to process your ride request at this time. Please try again later.`
  );
}

// ─── Dispatch to drivers ─────────────────────────────────────────────────────

export async function dispatchToDrivers(bookingId: string) {
  const booking = await prisma.rideRequest.findUnique({ where: { id: bookingId } });
  if (!booking) throw new Error(`Booking ${bookingId} not found`);
  if (booking.status !== "PENDING") throw new Error(`Booking ${bookingId} is not PENDING`);

  const drivers = await prisma.driver.findMany({ where: { whatsappEnabled: true } });
  if (drivers.length === 0) return { dispatched: 0 };

  const message =
    `New ride request!\n\n` +
    `Customer: ${booking.firstName} ${booking.lastName}\n` +
    `Pickup: ${booking.pickup}\n` +
    `Destination: ${booking.destination}\n` +
    `Pickup Time: ${booking.pickupTime ?? "ASAP"}\n\n` +
    `Reply "ACCEPT ${bookingId}" to take this ride.`;

  const results = await Promise.allSettled(
    drivers.map((driver) => sendTextMessage(driver.phone, message))
  );

  const dispatched = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  if (failed > 0) {
    console.error(`[dispatch] ${failed}/${drivers.length} WhatsApp sends failed for booking ${bookingId}`);
  }

  return { dispatched, total: drivers.length };
}

// ─── Driver accept ───────────────────────────────────────────────────────────

export async function acceptBooking(bookingId: string, driverId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const booking = await tx.rideRequest.findUnique({ where: { id: bookingId } });

    if (!booking) throw new Error(`Booking ${bookingId} not found`);
    if (booking.status !== "PENDING") {
      throw new Error(`Booking ${bookingId} is no longer available (status: ${booking.status})`);
    }

    const driver = await tx.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw new Error(`Driver ${driverId} not found`);

    const activeRide = await tx.rideRequest.findFirst({
      where: { driverId, status: { in: ["MATCHED", "IN_PROGRESS"] } },
    });
    if (activeRide) throw new Error(`Driver ${driverId} already has an active booking`);

    return tx.rideRequest.update({
      where: { id: bookingId },
      data: { status: "MATCHED", driverId },
      include: { driver: true },
    });
  });

  notifyCustomerOfDriver(result, result.driver!).catch((err) =>
    console.error("[acceptBooking] customer notification failed:", err)
  );

  return result;
}

// ─── Admin manually assigns driver ───────────────────────────────────────────

export async function assignDriver(bookingId: string, driverId: string) {
  const booking = await prisma.rideRequest.findUnique({ where: { id: bookingId } });
  if (!booking) throw new Error(`Booking ${bookingId} not found`);
  if (booking.status === "COMPLETED" || booking.status === "CANCELLED") {
    throw new Error(`Cannot assign driver to a ${booking.status} booking`);
  }

  const driver = await prisma.driver.findUnique({ where: { id: driverId } });
  if (!driver) throw new Error(`Driver ${driverId} not found`);

  const updated = await prisma.rideRequest.update({
    where: { id: bookingId },
    data: { status: "MATCHED", driverId },
    include: { driver: true },
  });

  notifyCustomerOfDriver(updated, updated.driver!).catch((err) =>
    console.error("[assignDriver] customer notification failed:", err)
  );

  return updated;
}

// ─── Send driver card to customer ────────────────────────────────────────────

async function notifyCustomerOfDriver(
  booking: { id: string; phone: string },
  driver: { firstName: string; lastName: string; carModel: string; carNameplate: string; photo: string | null }
) {
  const caption =
    `Your driver has been assigned!\n\n` +
    `Driver: ${driver.firstName} ${driver.lastName}\n` +
    `Car: ${driver.carModel}\n` +
    `Plate: ${driver.carNameplate}\n\n` +
    `Reply YES to confirm or NO to cancel.`;

  if (driver.photo) {
    const imagePath = path.join(process.cwd(), driver.photo);
    await sendImageMessage(booking.phone, imagePath, caption);
  } else {
    await sendTextMessage(booking.phone, caption);
  }

  await prisma.conversationState.upsert({
    where: { phone: booking.phone },
    create: {
      phone: booking.phone,
      step: "AWAITING_DRIVER_CONFIRMATION",
      pendingBookingId: booking.id,
    },
    update: {
      step: "AWAITING_DRIVER_CONFIRMATION",
      pendingBookingId: booking.id,
    },
  });
}

// ─── Status transitions ──────────────────────────────────────────────────────

export async function cancelBooking(id: string) {
  const booking = await prisma.rideRequest.findUnique({ where: { id } });
  if (!booking) throw new Error(`Booking ${id} not found`);
  if (booking.status === "COMPLETED") throw new Error("Cannot cancel a completed booking");
  if (booking.status === "CANCELLED") throw new Error("Booking is already cancelled");

  return prisma.rideRequest.update({
    where: { id },
    data: { status: "CANCELLED" },
  });
}

export async function startBooking(id: string) {
  const booking = await prisma.rideRequest.findUnique({ where: { id } });
  if (!booking) throw new Error(`Booking ${id} not found`);
  if (booking.status !== "MATCHED") {
    throw new Error(`Booking must be MATCHED to start (current: ${booking.status})`);
  }

  return prisma.rideRequest.update({
    where: { id },
    data: { status: "IN_PROGRESS" },
  });
}

export async function completeBooking(id: string) {
  const booking = await prisma.rideRequest.findUnique({ where: { id } });
  if (!booking) throw new Error(`Booking ${id} not found`);
  if (booking.status !== "IN_PROGRESS") {
    throw new Error(`Booking must be IN_PROGRESS to complete (current: ${booking.status})`);
  }

  return prisma.rideRequest.update({
    where: { id },
    data: { status: "COMPLETED" },
  });
}

export async function getBooking(id: string) {
  return prisma.rideRequest.findUnique({
    where: { id },
    include: { driver: true },
  });
}

export async function getAllBookings(filters: BookingFilters = {}) {
  const where: Record<string, unknown> = {};

  if (filters.status) where.status = filters.status;
  if (filters.driverId) where.driverId = filters.driverId;

  return prisma.rideRequest.findMany({
    where,
    include: { driver: true },
    orderBy: { createdAt: "desc" },
  });
}
