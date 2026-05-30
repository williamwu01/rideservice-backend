import { prisma } from "../lib/prisma";
import { sendTextMessage } from "./whatsapp";
import { confirmProposedDriver, declineProposedDriver, startBooking, completeBooking } from "./booking";
import { parsePickupTime, formatScheduledTime } from "./timeparse";
import { calculateEstimate } from "./estimate";
import { geocode } from "./tomtom";

const MESSAGES = {
  GREETING:
    "Hi! Welcome to Loop Rideshare\n\nI'll need a few details to book your ride. What's your full name?",
  ASK_PICKUP: (name: string) =>
    `Nice to meet you, ${name}!\n\nWhat's your pickup address?`,
  CONFIRM_PICKUP: (address: string) =>
    `Got it! Just to confirm, your pickup address is:\n\n📍 ${address}\n\nReply *1* to confirm or *2* to enter a different address.`,
  ASK_DESTINATION:
    "Great! Where would you like to go? (destination address)",
  CONFIRM_DESTINATION: (address: string) =>
    `And your destination is:\n\n📍 ${address}\n\nReply *1* to confirm or *2* to enter a different address.`,
  SHOW_ESTIMATE: (pickup: string, destination: string, fare: number, distanceKm: number, durationMin: number) =>
    `Here's your estimated fare:\n\n` +
    `📍 From: ${pickup}\n` +
    `🏁 To: ${destination}\n` +
    `📏 Distance: ${distanceKm.toFixed(1)} km\n` +
    `⏱ Duration: ~${durationMin} min\n` +
    `💰 Estimated Fare: $${fare.toFixed(2)}\n\n` +
    `When would you like to be picked up?\n\n(e.g. ASAP, Today 3:00 PM, Tomorrow 9:00 AM)`,
  SHOW_ESTIMATE_UNAVAILABLE: (pickup: string, destination: string) =>
    `Addresses confirmed!\n\n📍 From: ${pickup}\n🏁 To: ${destination}\n\n` +
    `When would you like to be picked up?\n\n(e.g. ASAP, Today 3:00 PM, Tomorrow 9:00 AM)`,
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
  INVALID_ADDRESS_REPLY:
    "Please reply *1* to confirm the address or *2* to enter a different one.",
  ALREADY_STARTED:
    "You already have an active request. Reply to continue where you left off.",
  DRIVER_CONFIRMED:
    "Great! Your driver is on the way.",
  DRIVER_DECLINED:
    "No problem! We'll look for another driver for you. Please wait a moment.",
  DRIVER_INVALID:
    "Please reply YES to confirm your driver or NO for a different one.",
};

// ─── Driver lookup ────────────────────────────────────────────────────────────

async function findDriverByPhone(phone: string) {
  const digits = phone.replace(/@.*/, "").replace(/\D/g, "");
  // Select only id + phone to avoid loading unnecessary fields for every message
  const all = await prisma.driver.findMany({ select: { id: true, phone: true } });
  const match = all.find((d) => d.phone.replace(/\D/g, "") === digits);
  if (!match) return null;
  return prisma.driver.findUnique({ where: { id: match.id } });
}

// ─── Driver commands ──────────────────────────────────────────────────────────

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
      `Commands:\nONLINE — go online\nOFFLINE — go offline\nSTART <bookingId> — picked up customer\nCOMPLETE <bookingId> — dropped off customer`
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
        `Unknown command.\nONLINE | OFFLINE | START <bookingId> | COMPLETE <bookingId>`
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await sendTextMessage(driverPhone, `Error: ${msg}`);
  }
}

// ─── Customer conversation start ──────────────────────────────────────────────

export async function startConversation(phone: string, force = false) {
  const existing = await prisma.conversationState.findUnique({ where: { phone } });

  if (!force && existing && existing.step !== "COMPLETE") {
    await sendTextMessage(phone, MESSAGES.ALREADY_STARTED);
    return { status: "already_active" };
  }

  const previousRide = await prisma.rideRequest.findFirst({
    where: { phone },
    orderBy: { createdAt: "desc" },
  });

  if (previousRide) {
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

// ─── Driver GPS location ──────────────────────────────────────────────────────

export async function handleLocationMessage(phone: string, latitude: number, longitude: number) {
  const driver = await findDriverByPhone(phone);
  if (!driver) return; // non-driver sharing location — ignore silently

  const firstUpdate = driver.latitude === null;

  await prisma.driver.update({
    where: { id: driver.id },
    data: { latitude, longitude },
  });

  console.log(`[location] driver ${driver.firstName} ${driver.lastName} → (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`);

  if (firstUpdate) {
    await sendTextMessage(phone, `Location received! We'll use this to assign you the closest rides.`);
  }
}

// ─── Main incoming message router ────────────────────────────────────────────
// Note: admin messages are already routed by whatsapp.ts before reaching here.

export async function handleIncomingMessage(phone: string, text: string) {
  try {
    // Check if sender is a driver
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
        const parts = trimmed.split(/\s+/);
        const firstName = parts[0] ?? "";
        const lastName = parts.slice(1).join(" ") ?? "";

        if (!firstName) {
          await sendTextMessage(phone, "Please send your full name to get started.");
          break;
        }

        await prisma.conversationState.update({
          where: { phone },
          data: { firstName, lastName, step: "AWAITING_PICKUP" },
        });
        await sendTextMessage(phone, MESSAGES.ASK_PICKUP(firstName));
        break;
      }

      case "AWAITING_PICKUP": {
        let resolvedPickup = trimmed;
        try {
          const geo = await geocode(trimmed);
          resolvedPickup = geo.formattedAddress;
        } catch {
          // If geocoding fails, fall back to what the user typed and let them confirm
        }
        await prisma.conversationState.update({
          where: { phone },
          data: { pickup: resolvedPickup, step: "CONFIRMING_PICKUP" },
        });
        await sendTextMessage(phone, MESSAGES.CONFIRM_PICKUP(resolvedPickup));
        break;
      }

      case "CONFIRMING_PICKUP": {
        if (trimmed === "1") {
          await prisma.conversationState.update({
            where: { phone },
            data: { step: "AWAITING_DESTINATION" },
          });
          await sendTextMessage(phone, MESSAGES.ASK_DESTINATION);
        } else if (trimmed === "2") {
          await prisma.conversationState.update({
            where: { phone },
            data: { pickup: null, step: "AWAITING_PICKUP" },
          });
          await sendTextMessage(phone, "No problem! Please enter your pickup address again.");
        } else {
          await sendTextMessage(phone, MESSAGES.INVALID_ADDRESS_REPLY);
        }
        break;
      }

      case "AWAITING_DESTINATION": {
        let resolvedDestination = trimmed;
        try {
          const geo = await geocode(trimmed);
          resolvedDestination = geo.formattedAddress;
        } catch {
          // If geocoding fails, fall back to what the user typed and let them confirm
        }
        await prisma.conversationState.update({
          where: { phone },
          data: { destination: resolvedDestination, step: "CONFIRMING_DESTINATION" },
        });
        await sendTextMessage(phone, MESSAGES.CONFIRM_DESTINATION(resolvedDestination));
        break;
      }

      case "CONFIRMING_DESTINATION": {
        if (trimmed === "1") {
          const updated = await prisma.conversationState.update({
            where: { phone },
            data: { step: "AWAITING_PICKUP_TIME" },
          });
          // Show price estimate before asking pickup time
          try {
            const estimate = await calculateEstimate(updated.pickup!, updated.destination!);
            await sendTextMessage(phone, MESSAGES.SHOW_ESTIMATE(
              updated.pickup!,
              updated.destination!,
              estimate.fare,
              estimate.distanceKm,
              estimate.durationMin,
            ));
          } catch {
            await sendTextMessage(phone, MESSAGES.SHOW_ESTIMATE_UNAVAILABLE(updated.pickup!, updated.destination!));
          }
        } else if (trimmed === "2") {
          await prisma.conversationState.update({
            where: { phone },
            data: { destination: null, step: "AWAITING_DESTINATION" },
          });
          await sendTextMessage(phone, "No problem! Please enter your destination address again.");
        } else {
          await sendTextMessage(phone, MESSAGES.INVALID_ADDRESS_REPLY);
        }
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

        let estimatedFare: number | undefined;
        let distanceKm: number | undefined;
        let durationMin: number | undefined;
        try {
          const estimate = await calculateEstimate(updated.pickup!, updated.destination!);
          estimatedFare = estimate.fare;
          distanceKm = estimate.distanceKm;
          durationMin = estimate.durationMin;
        } catch (err) {
          console.warn("[conversation] Fare estimation failed, booking without fare:", err);
        }

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
            estimatedFare,
            distanceKm,
            durationMin,
            status: "AWAITING_ADMIN",
          },
        });

        const timeLabel = scheduledPickupAt
          ? formatScheduledTime(scheduledPickupAt)
          : (updated.pickupTime ?? "ASAP");

        // Notify all admins
        const admins = await prisma.admin.findMany({ select: { phone: true } });
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

        for (const admin of admins) {
          sendTextMessage(admin.phone, adminMsg).catch((err) =>
            console.error(`[conversation] admin ${admin.phone} notification failed:`, err)
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
  } catch (err) {
    console.error(`[conversation] Error handling message from ${phone}:`, err);
    // Don't re-throw — let the message handler in whatsapp.ts handle the error response
    throw err;
  }
}
