import { prisma } from "../lib/prisma";
import { sendTextMessage } from "./whatsapp";

const MESSAGES = {
  GREETING:
    "Hi! Welcome to Loop Rideshare 🚗\n\nI'll need a few details to book your ride. What's your full name?",
  ASK_PICKUP: (name: string) =>
    `Nice to meet you, ${name}! 👋\n\nWhat's your pickup address?`,
  ASK_DESTINATION: "Got it! Where would you like to go?",
  CONFIRM: (firstName: string, pickup: string, destination: string) =>
    `Perfect! Here's your ride summary:\n\n` +
    `👤 Name: ${firstName}\n` +
    `📍 Pickup: ${pickup}\n` +
    `🏁 Destination: ${destination}\n\n` +
    `We're finding you a driver now and will update you shortly! 🎯`,
  ALREADY_STARTED:
    "You already have an active request. Reply to continue where you left off.",
};

export async function startConversation(phone: string) {
  const existing = await prisma.conversationState.findUnique({
    where: { phone },
  });

  if (existing && existing.step !== "COMPLETE") {
    await sendTextMessage(phone, MESSAGES.ALREADY_STARTED);
    return { status: "already_active" };
  }

  // Create or reset conversation state
  await prisma.conversationState.upsert({
    where: { phone },
    create: { phone, step: "AWAITING_NAME" },
    update: { step: "AWAITING_NAME", firstName: null, lastName: null, pickup: null, destination: null },
  });

  await sendTextMessage(phone, MESSAGES.GREETING);
  return { status: "started" };
}

export async function handleIncomingMessage(phone: string, text: string) {
  const state = await prisma.conversationState.findUnique({ where: { phone } });

  if (!state || state.step === "COMPLETE") {
    // New conversation — treat this as a fresh start
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
      const updated = await prisma.conversationState.update({
        where: { phone },
        data: { destination: trimmed, step: "COMPLETE" },
      });

      // Create the ride request
      await prisma.rideRequest.create({
        data: {
          phone,
          firstName: updated.firstName!,
          lastName: updated.lastName!,
          pickup: updated.pickup!,
          destination: trimmed,
          status: "PENDING",
        },
      });

      await sendTextMessage(
        phone,
        MESSAGES.CONFIRM(updated.firstName!, updated.pickup!, trimmed)
      );
      break;
    }
  }
}
