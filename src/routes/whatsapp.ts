import { Router, Request, Response } from "express";
import { startConversation, handleIncomingMessage } from "../services/conversation";
import { flushDevOutbox, enableSimulationMode, disableSimulationMode } from "../services/whatsapp";
import { requireApiKey } from "../middleware/apiKey";
import { prisma } from "../lib/prisma";

const router = Router();

// POST /api/whatsapp/start
// Called by the frontend when user submits their phone number
router.post("/start", async (req: Request, res: Response) => {
  const { phone } = req.body;

  if (!phone) {
    res.status(400).json({ error: "Phone number is required" });
    return;
  }

  // Normalize: strip non-digits, prepend 1 if 10-digit North American number
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.length === 10 ? `1${digits}` : digits;
  console.log(`[whatsapp/start] raw="${phone}" normalized="${normalized}"`);

  try {
    enableSimulationMode();
    let result;
    try {
      result = await startConversation(normalized, true);
    } finally {
      disableSimulationMode();
    }

    const botReplies = flushDevOutbox();
    const state = await prisma.conversationState.findUnique({ where: { phone: normalized } });

    res.json({ success: true, ...result, botReplies, state });
  } catch (err: any) {
    console.error("[whatsapp/start] Error:", err?.message, err?.stack);
    res.status(500).json({ error: "Failed to start conversation" });
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
    try {
      await handleIncomingMessage(phone, message);
    } finally {
      disableSimulationMode();
    }

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
