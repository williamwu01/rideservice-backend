import { Router, Request, Response } from "express";
import { startConversation, handleIncomingMessage } from "../services/conversation";
import { flushDevOutbox, enableSimulationMode, disableSimulationMode } from "../services/whatsapp"; // used by /simulate
import { isAdmin, handleAdminCommand } from "../services/admin/index";
import { requireApiKey } from "../middleware/apiKey";
import { prisma } from "../lib/prisma";
import { config } from "../config/env";

const router = Router();

// POST /api/whatsapp/start
// Called by the frontend when user submits their phone number
router.post("/start", async (req: Request, res: Response) => {
  const { phone, simulate } = req.body;

  if (!phone) {
    res.status(400).json({ error: "Phone number is required" });
    return;
  }

  // Normalize: strip non-digits, prepend 1 if 10-digit North American number
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.length === 10 ? `1${digits}` : digits;
  console.log(`[whatsapp/start] raw="${phone}" normalized="${normalized}"`);

  // Simulate only when the global simulator is on, or when the request explicitly
  // asks for it outside production. Real sends must be the default — a missing
  // NODE_ENV must never silently disable SMS.
  const isSim = config.simulatorMode || (simulate === true && process.env.NODE_ENV !== "production");

  try {
    if (isSim) enableSimulationMode();
    const result = await startConversation(normalized, true);
    if (isSim) disableSimulationMode();

    const botReplies = isSim ? flushDevOutbox() : [];
    const state = await prisma.conversationState.findUnique({ where: { phone: normalized } });

    res.json({ success: true, ...result, state, botReplies });
  } catch (err: any) {
    disableSimulationMode();
    console.error("[whatsapp/start] Error:", err?.message, err?.stack);
    res.status(500).json({ error: "Failed to start conversation" });
  }
});

// POST /api/sms/incoming
// Webhook called by the SMS Gateway app when a customer replies
router.post("/incoming", async (req: Request, res: Response) => {
  // SMS Gateway sends: { message: "...", phoneNumber: "+17786689615", receivedAt: "..." }
  const { message, phoneNumber } = req.body;

  if (!message || !phoneNumber) {
    res.status(400).json({ error: "message and phoneNumber are required" });
    return;
  }

  // Normalize phone: strip non-digits, ensure country code
  const normalized = phoneNumber.replace(/\D/g, "");
  console.log(`[sms/incoming] from=${normalized} message="${message}"`);

  try {
    if (await isAdmin(normalized)) {
      await handleAdminCommand(normalized, message);
    } else {
      await handleIncomingMessage(normalized, message);
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error("[sms/incoming] Error:", err?.message, err?.stack);
    res.status(500).json({ error: "Failed to handle incoming message" });
  }
});

// POST /api/whatsapp/simulate
// Dev-only: simulate an incoming WhatsApp message from any phone number.
// Requires API key and is blocked entirely in production.
router.post("/simulate", requireApiKey, async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === "production") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const { phone, message } = req.body;

  if (!phone || !message) {
    res.status(400).json({ error: "phone and message are required" });
    return;
  }

  try {
    enableSimulationMode();

    if (await isAdmin(phone)) {
      await handleAdminCommand(phone, message);
    } else {
      await handleIncomingMessage(phone, message);
    }

    disableSimulationMode();
    const botReplies = flushDevOutbox();
    const state = await prisma.conversationState.findUnique({ where: { phone } });
    const latestBooking = await prisma.rideRequest.findFirst({
      where: { phone },
      orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, botReplies, state, latestBooking });
  } catch (err: any) {
    console.error("[whatsapp/simulate] Error:", err?.message, err?.stack);
    res.status(500).json({ error: err?.message ?? "Simulation failed" });
  }
});

export default router;
