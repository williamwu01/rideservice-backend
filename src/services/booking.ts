import path from "path";
import { prisma } from "../lib/prisma";
import { sendTextMessage, sendImageMessage } from "./whatsapp";
import { config } from "../config/env";
import { geocodeAddress, haversineKm } from "./geocode";
import { parsePickupTime, formatScheduledTime } from "./timeparse";

type CreateBookingInput = {
  phone: string;
  firstName: string;
  lastName: string;
  pickup: string;
  destination: string;
  pickupTime?: string;
  passengers?: number;
  luggage?: number;
};

type BookingFilters = {
  status?: string;
  driverId?: string;
};

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createBooking(data: CreateBookingInput) {
  const scheduledPickupAt = data.pickupTime ? parsePickupTime(data.pickupTime) : null;

  const booking = await prisma.rideRequest.create({
    data: {
      phone: data.phone,
      firstName: data.firstName,
      lastName: data.lastName,
      pickup: data.pickup,
      destination: data.destination,
      pickupTime: data.pickupTime,
      passengers: data.passengers ?? 1,
      luggage: data.luggage ?? 0,
      scheduledPickupAt,
      status: "AWAITING_ADMIN",
    },
  });

  notifyAdmin(booking).catch((err) =>
    console.error("[createBooking] admin notification failed:", err)
  );

  return booking;
}

// ─── Admin notification ───────────────────────────────────────────────────────

async function notifyAdmin(booking: {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  pickup: string;
  destination: string;
  pickupTime?: string | null;
  passengers: number;
  luggage: number;
  scheduledPickupAt?: Date | null;
}) {
  if (!config.adminPhone) {
    console.warn("[booking] ADMIN_PHONE not set — skipping admin notification");
    return;
  }

  const timeLabel = booking.scheduledPickupAt
    ? formatScheduledTime(booking.scheduledPickupAt)
    : (booking.pickupTime ?? "ASAP");

  const message =
    `New ride request pending your approval!\n\n` +
    `Customer: ${booking.firstName} ${booking.lastName}\n` +
    `Phone: ${booking.phone}\n` +
    `Pickup: ${booking.pickup}\n` +
    `Destination: ${booking.destination}\n` +
    `Pickup Time: ${timeLabel}\n` +
    `Passengers: ${booking.passengers}\n` +
    `Luggage: ${booking.luggage}\n\n` +
    `Reply CONFIRM ${booking.id} to approve\n` +
    `Reply DECLINE ${booking.id} to reject`;

  await sendTextMessage(config.adminPhone, message);
}

// ─── Admin confirm / decline ──────────────────────────────────────────────────

export async function adminConfirmBooking(bookingId: string): Promise<{ scheduled: boolean; timeLabel?: string }> {
  const booking = await prisma.rideRequest.findUnique({ where: { id: bookingId } });
  if (!booking) throw new Error(`Booking ${bookingId} not found`);
  if (booking.status !== "AWAITING_ADMIN") {
    throw new Error(`Booking is not awaiting admin approval (status: ${booking.status})`);
  }

  const now = new Date();
  const windowMs = config.scheduleDispatchWindowMinutes * 60 * 1000;
  const isScheduledFuture =
    booking.scheduledPickupAt !== null &&
    booking.scheduledPickupAt.getTime() - now.getTime() > windowMs;

  if (isScheduledFuture) {
    await prisma.rideRequest.update({
      where: { id: bookingId },
      data: { status: "SCHEDULED" },
    });

    const timeLabel = formatScheduledTime(booking.scheduledPickupAt!);
    await sendTextMessage(
      booking.phone,
      `Your ride has been confirmed for ${timeLabel}!\n\nWe'll find you a driver shortly before your pickup time. You'll receive a notification when a driver is on the way.`
    );

    return { scheduled: true, timeLabel };
  } else {
    await prisma.rideRequest.update({
      where: { id: bookingId },
      data: { status: "PENDING" },
    });

    await sendTextMessage(
      booking.phone,
      `Your ride request has been approved! Finding you the best available driver...`
    );

    await selectAndProposeDriver(bookingId);
    return { scheduled: false };
  }
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

// ─── Select and propose a single driver to the customer ───────────────────────

export async function selectAndProposeDriver(bookingId: string): Promise<boolean> {
  const booking = await prisma.rideRequest.findUnique({ where: { id: bookingId } });
  if (!booking) throw new Error(`Booking ${bookingId} not found`);

  // Find online drivers with capacity, excluding already tried ones
  const candidates = await prisma.driver.findMany({
    where: {
      whatsappEnabled: true,
      isOnline: true,
      maxPassengers: { gte: booking.passengers },
      maxLuggage: { gte: booking.luggage },
      id: { notIn: booking.triedDriverIds.length > 0 ? booking.triedDriverIds : [""] },
    },
  });

  if (candidates.length === 0) {
    await sendTextMessage(
      booking.phone,
      `Sorry, no drivers are available right now. Our team has been notified and will follow up with you shortly.`
    );

    if (config.adminPhone) {
      await sendTextMessage(
        config.adminPhone,
        `No available drivers for booking ${bookingId} (${booking.firstName} ${booking.lastName}). All drivers tried or none online.`
      );
    }

    await prisma.rideRequest.update({
      where: { id: bookingId },
      data: { status: "CANCELLED" },
    });

    return false;
  }

  // Sort by proximity to pickup
  const pickupCoords = await geocodeAddress(booking.pickup);
  let ranked = candidates;

  if (pickupCoords) {
    const withLocation = candidates
      .filter((d) => d.latitude !== null && d.longitude !== null)
      .map((d) => ({
        driver: d,
        distanceKm: haversineKm(d.latitude!, d.longitude!, pickupCoords.lat, pickupCoords.lon),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .map((d) => d.driver);

    const withoutLocation = candidates.filter(
      (d) => d.latitude === null || d.longitude === null
    );

    ranked = [...withLocation, ...withoutLocation];
  }

  const selected = ranked[0];

  // Store proposed driver on booking
  await prisma.rideRequest.update({
    where: { id: bookingId },
    data: { proposedDriverId: selected.id },
  });

  // Show driver to customer
  await proposeDriverToCustomer(booking, selected);

  console.log(`[propose] driver ${selected.firstName} ${selected.lastName} proposed for booking ${bookingId}`);
  return true;
}

// ─── Customer confirms proposed driver ────────────────────────────────────────

export async function confirmProposedDriver(bookingId: string) {
  const booking = await prisma.rideRequest.findUnique({ where: { id: bookingId } });
  if (!booking) throw new Error(`Booking ${bookingId} not found`);
  if (!booking.proposedDriverId) throw new Error(`No proposed driver for booking ${bookingId}`);

  const driver = await prisma.driver.findUnique({ where: { id: booking.proposedDriverId } });
  if (!driver) throw new Error(`Proposed driver not found`);

  // Match the booking
  await prisma.rideRequest.update({
    where: { id: bookingId },
    data: {
      status: "MATCHED",
      driverId: booking.proposedDriverId,
      proposedDriverId: null,
    },
  });

  // Notify driver with full job details
  const customerDigits = booking.phone.replace(/@.*/, "").replace(/\D/g, "");
  const customerLink = `https://wa.me/${customerDigits}`;

  const timeLabel = booking.scheduledPickupAt
    ? formatScheduledTime(booking.scheduledPickupAt)
    : (booking.pickupTime ?? "ASAP");

  await sendTextMessage(
    driver.phone,
    `You have been assigned a ride!\n\n` +
    `Customer: ${booking.firstName} ${booking.lastName}\n` +
    `Pickup: ${booking.pickup}\n` +
    `Destination: ${booking.destination}\n` +
    `Pickup Time: ${timeLabel}\n` +
    `Passengers: ${booking.passengers}\n` +
    `Luggage: ${booking.luggage}\n` +
    `Contact: ${customerLink}\n\n` +
    `Reply START ${bookingId} when you've picked up the customer.`
  );
}

// ─── Customer declines proposed driver — try next ─────────────────────────────

export async function declineProposedDriver(bookingId: string) {
  const booking = await prisma.rideRequest.findUnique({ where: { id: bookingId } });
  if (!booking) throw new Error(`Booking ${bookingId} not found`);

  // Add current proposed driver to the tried list
  const newTriedIds = [
    ...booking.triedDriverIds,
    ...(booking.proposedDriverId ? [booking.proposedDriverId] : []),
  ];

  await prisma.rideRequest.update({
    where: { id: bookingId },
    data: {
      proposedDriverId: null,
      triedDriverIds: newTriedIds,
    },
  });

  // Try to propose the next best driver
  const found = await selectAndProposeDriver(bookingId);

  if (!found) {
    // No more drivers — close the conversation
    await prisma.conversationState.updateMany({
      where: { pendingBookingId: bookingId },
      data: { step: "COMPLETE", pendingBookingId: null },
    });
  }
}

// ─── Send driver proposal to customer ────────────────────────────────────────

async function proposeDriverToCustomer(
  booking: { id: string; phone: string },
  driver: {
    firstName: string;
    lastName: string;
    phone: string;
    carModel: string;
    carNameplate: string;
    photo: string | null;
  }
) {
  const driverDigits = driver.phone.replace(/\D/g, "");
  const whatsappLink = `https://wa.me/${driverDigits}`;

  const caption =
    `We found a driver for you!\n\n` +
    `Driver: ${driver.firstName} ${driver.lastName}\n` +
    `Car: ${driver.carModel}\n` +
    `Plate: ${driver.carNameplate}\n` +
    `Contact: ${whatsappLink}\n\n` +
    `Reply YES to confirm or NO for a different driver.`;

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

// ─── Admin manually assigns driver (bypasses customer confirmation) ───────────

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
    data: { status: "MATCHED", driverId, proposedDriverId: null },
    include: { driver: true },
  });

  // Notify driver directly
  const customerDigits = booking.phone.replace(/@.*/, "").replace(/\D/g, "");
  const customerLink = `https://wa.me/${customerDigits}`;
  const timeLabel = booking.scheduledPickupAt
    ? formatScheduledTime(booking.scheduledPickupAt)
    : (booking.pickupTime ?? "ASAP");

  await sendTextMessage(
    driver.phone,
    `You have been assigned a ride!\n\n` +
    `Customer: ${booking.firstName} ${booking.lastName}\n` +
    `Pickup: ${booking.pickup}\n` +
    `Destination: ${booking.destination}\n` +
    `Pickup Time: ${timeLabel}\n` +
    `Passengers: ${booking.passengers}\n` +
    `Luggage: ${booking.luggage}\n` +
    `Contact: ${customerLink}\n\n` +
    `Reply START ${bookingId} when you've picked up the customer.`
  ).catch((err) => console.error("[assignDriver] driver notification failed:", err));

  return updated;
}

// ─── Status transitions ───────────────────────────────────────────────────────

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
