import { prisma } from "../lib/prisma";
import { sendTextMessage } from "./whatsapp";
import { cancelBooking, adminConfirmBooking, adminDeclineBooking, confirmProposedDriver, declineProposedDriver, startBooking, completeBooking } from "./booking";
import { config } from "../config/env";
import { parsePickupTime, formatScheduledTime } from "./timeparse";

const MESSAGES = {
  GREETING:
    "Hi! Welcome to Loop Rideshare\n\nI'll need a few details to book your ride. What's your full name?",
  ASK_PICKUP: (name: string) =>
    `Nice to meet you, ${name}!\n\nWhat's your pickup address?`,
  ASK_DESTINATION:
    "Got it! Where would you like to go?",
  ASK_PICKUP_TIME:
    "When would you like to be picked up?\n\n(e.g. ASAP, Today 3:00 PM, Tomorrow 9:00 AM)",
  ASK_PASSENGERS:
    "How many passengers will there be? (including yourself)",
  ASK_LUGGAGE:
    "How many pieces of luggage will you have?",
  CONFIRM: (firstName: string, pickup: string, destination: string, pickupTime: string, passengers: number, luggage: number) =>
    `Perfect! Here's your ride summary:\n\n` +
    `Name: ${firstName}\n` +
    `Pickup: ${pickup}\n` +
    `Destination: ${destination}\n` +
    `Pickup Time: ${pickupTime}\n` +
    `Passengers: ${passengers}\n` +
    `Luggage: ${luggage}\n\n` +
    `Your request is being reviewed. We'll update you shortly!`,
  INVALID_NUMBER: (field: string) =>
    `Please enter a valid number for ${field}.`,
  ALREADY_STARTED:
    "You already have an active request. Reply to continue where you left off.",
  DRIVER_CONFIRMED:
    "Great! Your driver is on the way.",
  DRIVER_DECLINED:
    "No problem! We'll look for another driver for you. Please wait a moment.",
  DRIVER_INVALID:
    "Please reply YES to confirm your driver or NO to cancel.",
};

// ─── Admin routing ────────────────────────────────────────────────────────────

function isAdmin(phone: string): boolean {
  if (!config.adminPhone) return false;
  const adminDigits = config.adminPhone.replace(/\D/g, "");
  const senderDigits = phone.replace(/@.*/, "").replace(/\D/g, "");
  return senderDigits === adminDigits;
}

async function handleAdminMessage(adminPhone: string, text: string) {
  const parts = text.trim().split(/\s+/);
  const command = parts[0]?.toUpperCase();
  const bookingId = parts[1];

  if (!bookingId) {
    await sendTextMessage(adminPhone, "Usage:\nCONFIRM {bookingId}\nDECLINE {bookingId}");
    return;
  }

  if (command === "CONFIRM") {
    const result = await adminConfirmBooking(bookingId);
    const adminReply = result.scheduled
      ? `Booking ${bookingId} confirmed. Ride is scheduled for ${result.timeLabel} — a driver will be proposed to the customer closer to pickup time.`
      : `Booking ${bookingId} confirmed. Best available driver proposed to customer — waiting for their confirmation.`;
    await sendTextMessage(adminPhone, adminReply);
  } else if (command === "DECLINE") {
    await adminDeclineBooking(bookingId);
    await sendTextMessage(adminPhone, `Booking ${bookingId} has been declined.`);
  } else {
    await sendTextMessage(adminPhone, "Unknown command.\nCONFIRM {bookingId}\nDECLINE {bookingId}");
  }
}

// ─── Driver routing ───────────────────────────────────────────────────────────

async function findDriverByPhone(phone: string) {
  const digits = phone.replace(/@.*/, "").replace(/\D/g, "");
  const drivers = await prisma.driver.findMany();
  return drivers.find((d) => d.phone.replace(/\D/g, "") === digits) ?? null;
}

async function handleDriverMessage(driverPhone: string, driverId: string, text: string) {
  const parts = text.trim().split(/\s+/);
  const command = parts[0]?.toUpperCase();
  const bookingId = parts[1];

  if (command === "ONLINE") {
    await prisma.driver.update({ where: { id: driverId }, data: { isOnline: true } });
    await sendTextMessage(
      driverPhone,
      `You are now ONLINE and will receive ride assignments.\n\nShare your live location so we can assign you the closest rides.`
    );
    return;
  }

  if (command === "OFFLINE") {
    await prisma.driver.update({ where: { id: driverId }, data: { isOnline: false } });
    await sendTextMessage(driverPhone, `You are now OFFLINE. You won't receive new ride assignments.`);
    return;
  }

  if (!bookingId) {
    await sendTextMessage(
      driverPhone,
      `Commands:\nONLINE — go online\nOFFLINE — go offline\nSTART {bookingId} — picked up customer\nCOMPLETE {bookingId} — dropped off customer`
    );
    return;
  }

  try {
    if (command === "START") {
      await startBooking(bookingId);
      await sendTextMessage(driverPhone, `Ride started! Reply COMPLETE ${bookingId} when you've dropped off the customer.`);
    } else if (command === "COMPLETE") {
      await completeBooking(bookingId);
      await sendTextMessage(driverPhone, `Ride completed! Great job.`);
    } else {
      await sendTextMessage(
        driverPhone,
        `Unknown command.\nONLINE — go online\nOFFLINE — go offline\nSTART {bookingId}\nCOMPLETE {bookingId}`
      );
    }
  } catch (err: any) {
    await sendTextMessage(driverPhone, `Error: ${err.message}`);
  }
}

// ─── Customer conversation ────────────────────────────────────────────────────

export async function startConversation(phone: string, force = false) {
  const existing = await prisma.conversationState.findUnique({ where: { phone } });

  if (!force && existing && existing.step !== "COMPLETE") {
    await sendTextMessage(phone, MESSAGES.ALREADY_STARTED);
    return { status: "already_active" };
  }

  // Check if this customer has ridden with us before
  const previousRide = await prisma.rideRequest.findFirst({
    where: { phone },
    orderBy: { createdAt: "desc" },
  });

  if (previousRide) {
    // Returning customer — skip name, go straight to pickup
    await prisma.conversationState.upsert({
      where: { phone },
      create: {
        phone,
        step: "AWAITING_PICKUP",
        firstName: previousRide.firstName,
        lastName: previousRide.lastName,
        pickup: null,
        destination: null,
        pickupTime: null,
        passengers: null,
        luggage: null,
      },
      update: {
        step: "AWAITING_PICKUP",
        firstName: previousRide.firstName,
        lastName: previousRide.lastName,
        pickup: null,
        destination: null,
        pickupTime: null,
        passengers: null,
        luggage: null,
      },
    });

    await sendTextMessage(phone, MESSAGES.ASK_PICKUP(previousRide.firstName));
    return { status: "started" };
  }

  // New customer — start from the beginning
  await prisma.conversationState.upsert({
    where: { phone },
    create: { phone, step: "AWAITING_NAME" },
    update: {
      step: "AWAITING_NAME",
      firstName: null,
      lastName: null,
      pickup: null,
      destination: null,
      pickupTime: null,
      passengers: null,
      luggage: null,
    },
  });

  await sendTextMessage(phone, MESSAGES.GREETING);
  return { status: "started" };
}

// ─── Driver location update (WhatsApp location message) ──────────────────────

export async function handleLocationMessage(phone: string, latitude: number, longitude: number) {
  const driver = await findDriverByPhone(phone);

  if (!driver) {
    // Non-drivers sharing location — ignore silently
    return;
  }

  await prisma.driver.update({
    where: { id: driver.id },
    data: { latitude, longitude },
  });

  console.log(`[location] driver ${driver.firstName} ${driver.lastName} → (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`);

  // Only confirm the first update so we don't spam the driver on every live location ping
  if (driver.latitude === null) {
    await sendTextMessage(
      phone,
      `Location received! We'll use this to assign you the closest rides.`
    );
  }
}

export async function handleIncomingMessage(phone: string, text: string) {
  // Route admin messages separately
  if (isAdmin(phone)) {
    await handleAdminMessage(phone, text);
    return;
  }

  // Route driver messages separately
  const driver = await findDriverByPhone(phone);
  if (driver) {
    await handleDriverMessage(phone, driver.id, text);
    return;
  }

  const state = await prisma.conversationState.findUnique({ where: { phone } });

  if (!state || state.step === "COMPLETE") {
    await startConversation(phone);
    return;
  }

  const trimmed = text.trim();

  switch (state.step) {
    case "AWAITING_NAME": {
      const parts = trimmed.split(" ");
      const firstName = parts[0];
      const lastName = parts.slice(1).join(" ") || "";

      await prisma.conversationState.update({
        where: { phone },
        data: { firstName, lastName, step: "AWAITING_PICKUP" },
      });

      await sendTextMessage(phone, MESSAGES.ASK_PICKUP(firstName));
      break;
    }

    case "AWAITING_PICKUP": {
      await prisma.conversationState.update({
        where: { phone },
        data: { pickup: trimmed, step: "AWAITING_DESTINATION" },
      });

      await sendTextMessage(phone, MESSAGES.ASK_DESTINATION);
      break;
    }

    case "AWAITING_DESTINATION": {
      await prisma.conversationState.update({
        where: { phone },
        data: { destination: trimmed, step: "AWAITING_PICKUP_TIME" },
      });

      await sendTextMessage(phone, MESSAGES.ASK_PICKUP_TIME);
      break;
    }

    case "AWAITING_PICKUP_TIME": {
      await prisma.conversationState.update({
        where: { phone },
        data: { pickupTime: trimmed, step: "AWAITING_PASSENGERS" },
      });

      await sendTextMessage(phone, MESSAGES.ASK_PASSENGERS);
      break;
    }

    case "AWAITING_PASSENGERS": {
      const passengerCount = parseInt(trimmed, 10);
      if (isNaN(passengerCount) || passengerCount < 1) {
        await sendTextMessage(phone, MESSAGES.INVALID_NUMBER("passengers"));
        break;
      }

      await prisma.conversationState.update({
        where: { phone },
        data: { passengers: passengerCount, step: "AWAITING_LUGGAGE" },
      });

      await sendTextMessage(phone, MESSAGES.ASK_LUGGAGE);
      break;
    }

    case "AWAITING_LUGGAGE": {
      const luggageCount = parseInt(trimmed, 10);
      if (isNaN(luggageCount) || luggageCount < 0) {
        await sendTextMessage(phone, MESSAGES.INVALID_NUMBER("luggage"));
        break;
      }

      const updated = await prisma.conversationState.update({
        where: { phone },
        data: { luggage: luggageCount, step: "COMPLETE" },
      });

      const scheduledPickupAt = updated.pickupTime ? parsePickupTime(updated.pickupTime) : null;

      const booking = await prisma.rideRequest.create({
        data: {
          phone,
          firstName: updated.firstName!,
          lastName: updated.lastName!,
          pickup: updated.pickup!,
          destination: updated.destination!,
          pickupTime: updated.pickupTime ?? undefined,
          passengers: updated.passengers ?? 1,
          luggage: luggageCount,
          scheduledPickupAt,
          status: "AWAITING_ADMIN",
        },
      });

      const timeLabel = scheduledPickupAt
        ? formatScheduledTime(scheduledPickupAt)
        : (updated.pickupTime ?? "ASAP");

      // Notify admin
      if (config.adminPhone) {
        const adminMsg =
          `New ride request pending your approval!\n\n` +
          `Customer: ${updated.firstName} ${updated.lastName}\n` +
          `Phone: ${phone}\n` +
          `Pickup: ${updated.pickup}\n` +
          `Destination: ${updated.destination}\n` +
          `Pickup Time: ${timeLabel}\n` +
          `Passengers: ${updated.passengers ?? 1}\n` +
          `Luggage: ${luggageCount}\n\n` +
          `Reply CONFIRM ${booking.id} to approve\n` +
          `Reply DECLINE ${booking.id} to reject`;

        sendTextMessage(config.adminPhone, adminMsg).catch((err) =>
          console.error("[conversation] admin notification failed:", err)
        );
      }

      await sendTextMessage(
        phone,
        MESSAGES.CONFIRM(
          updated.firstName!,
          updated.pickup!,
          updated.destination!,
          timeLabel,
          updated.passengers ?? 1,
          luggageCount
        )
      );
      break;
    }

    case "AWAITING_DRIVER_CONFIRMATION": {
      const reply = trimmed.toUpperCase();

      if (reply === "YES") {
        if (state.pendingBookingId) {
          await confirmProposedDriver(state.pendingBookingId);
        }
        await prisma.conversationState.update({
          where: { phone },
          data: { step: "COMPLETE", pendingBookingId: null },
        });
        await sendTextMessage(phone, MESSAGES.DRIVER_CONFIRMED);
      } else if (reply === "NO") {
        if (state.pendingBookingId) {
          // declineProposedDriver will either propose the next driver
          // (keeping state at AWAITING_DRIVER_CONFIRMATION) or
          // set state to COMPLETE if no more drivers are available
          await sendTextMessage(phone, `No problem! Let me find you another driver...`);
          await declineProposedDriver(state.pendingBookingId);
        } else {
          await prisma.conversationState.update({
            where: { phone },
            data: { step: "COMPLETE", pendingBookingId: null },
          });
          await sendTextMessage(phone, MESSAGES.DRIVER_DECLINED);
        }
      } else {
        await sendTextMessage(phone, MESSAGES.DRIVER_INVALID);
      }
      break;
    }
  }
}
