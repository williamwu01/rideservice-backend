import * as chrono from "chrono-node";
import { prisma } from "../lib/prisma";
import { sendTextMessage } from "./whatsapp";
import { cancelBooking, adminConfirmBooking, adminDeclineBooking, acceptBooking, startBooking, completeBooking } from "./booking";

const MESSAGES = {
  GREETING:
    "Hi! Welcome to Loop Rideshare\n\nI'll need a few details to book your ride. What's your full name?",
  ASK_PICKUP: (name: string) =>
    `Nice to meet you, ${name}!\n\nWhat's your pickup address?`,
  ASK_DESTINATION:
    "Got it! Where would you like to go?",
  ASK_PICKUP_TIME:
    "Almost done! When would you like to be picked up?\n\n(e.g. ASAP, Today 3:00 PM, Tomorrow 9:00 AM)",
  CONFIRM: (firstName: string, pickup: string, destination: string, pickupTime: string) =>
    `Perfect! Here's your ride summary:\n\n` +
    `Name: ${firstName}\n` +
    `Pickup: ${pickup}\n` +
    `Destination: ${destination}\n` +
    `Pickup Time: ${pickupTime}\n\n` +
    `Your request is being reviewed. We'll update you shortly!`,
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

async function isAdmin(phone: string): Promise<boolean> {
  const digits = phone.replace(/@.*/, "").replace(/\D/g, "");
  const admin = await prisma.admin.findUnique({ where: { phone: digits } });
  return !!admin;
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
    await adminConfirmBooking(bookingId);
    await sendTextMessage(adminPhone, `Booking ${bookingId} confirmed. Dispatching to drivers now.`);
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

  if (!bookingId) {
    await sendTextMessage(driverPhone, "Commands:\nACCEPT {bookingId}\nSTART {bookingId}\nCOMPLETE {bookingId}");
    return;
  }

  try {
    if (command === "ACCEPT") {
      await acceptBooking(bookingId, driverId);
      await sendTextMessage(driverPhone, `Booking ${bookingId} accepted! Reply START ${bookingId} when you've picked up the customer.`);
    } else if (command === "START") {
      await startBooking(bookingId);
      await sendTextMessage(driverPhone, `Ride started! Reply COMPLETE ${bookingId} when you've dropped off the customer.`);
    } else if (command === "COMPLETE") {
      await completeBooking(bookingId);
      await sendTextMessage(driverPhone, `Ride completed! Great job.`);
    } else {
      await sendTextMessage(driverPhone, "Unknown command.\nACCEPT {bookingId}\nSTART {bookingId}\nCOMPLETE {bookingId}");
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
      },
      update: {
        step: "AWAITING_PICKUP",
        firstName: previousRide.firstName,
        lastName: previousRide.lastName,
        pickup: null,
        destination: null,
        pickupTime: null,
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
    },
  });

  await sendTextMessage(phone, MESSAGES.GREETING);
  return { status: "started" };
}

export async function handleIncomingMessage(phone: string, text: string) {
  // Route admin messages separately
  if (await isAdmin(phone)) {
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
      // Handle ASAP as a special case
      let pickupTime: Date;
      if (trimmed.toLowerCase() === "asap") {
        pickupTime = new Date();
      } else {
        const parsed = chrono.parseDate(trimmed, new Date(), { timezones: { "PDT": -420, "PST": -480 } });
        if (!parsed) {
          await sendTextMessage(
            phone,
            `Sorry, I couldn't understand that time. Please try one of these formats:\n\n` +
            `• ASAP\n` +
            `• Today 3pm\n` +
            `• Tomorrow 9:00 AM\n` +
            `• May 29 at 2:00 PM\n` +
            `• 10/30/2025 3pm`
          );
          return;
        }
        if (parsed < new Date()) {
          await sendTextMessage(phone, "That time has already passed. Please enter a future pickup time.");
          return;
        }
        pickupTime = parsed;
      }

      const formattedTime = pickupTime.toLocaleString("en-CA", {
        timeZone: "America/Vancouver",
        dateStyle: "medium",
        timeStyle: "short",
      });

      const updated = await prisma.conversationState.update({
        where: { phone },
        data: { pickupTime: formattedTime, step: "COMPLETE" },
      });

      const booking = await prisma.rideRequest.create({
        data: {
          phone,
          firstName: updated.firstName!,
          lastName: updated.lastName!,
          pickup: updated.pickup!,
          destination: updated.destination!,
          pickupTime: trimmed,
          status: "AWAITING_ADMIN",
        },
      });

      // Notify all admins from DB
      const admins = await prisma.admin.findMany();
      const adminMsg =
        `New ride request pending your approval!\n\n` +
        `Customer: ${updated.firstName} ${updated.lastName}\n` +
        `Phone: ${phone}\n` +
        `Pickup: ${updated.pickup}\n` +
        `Destination: ${updated.destination}\n` +
        `Pickup Time: ${formattedTime}\n\n` +
        `Reply CONFIRM ${booking.id} to approve\n` +
        `Reply DECLINE ${booking.id} to reject`;

      for (const admin of admins) {
        sendTextMessage(admin.phone, adminMsg).catch((err) =>
          console.error(`[conversation] admin notification failed for ${admin.phone}:`, err)
        );
      }

      await sendTextMessage(
        phone,
        MESSAGES.CONFIRM(updated.firstName!, updated.pickup!, updated.destination!, trimmed)
      );
      break;
    }

    case "AWAITING_DRIVER_CONFIRMATION": {
      const reply = trimmed.toUpperCase();

      if (reply === "YES") {
        await prisma.conversationState.update({
          where: { phone },
          data: { step: "COMPLETE", pendingBookingId: null },
        });
        await sendTextMessage(phone, MESSAGES.DRIVER_CONFIRMED);
      } else if (reply === "NO") {
        if (state.pendingBookingId) {
          await cancelBooking(state.pendingBookingId).catch((err) =>
            console.error("[conversation] cancel booking failed:", err)
          );
        }
        await prisma.conversationState.update({
          where: { phone },
          data: { step: "COMPLETE", pendingBookingId: null },
        });
        await sendTextMessage(phone, MESSAGES.DRIVER_DECLINED);
      } else {
        await sendTextMessage(phone, MESSAGES.DRIVER_INVALID);
      }
      break;
    }
  }
}
