import express from "express";
import { prisma } from "../lib/prisma";
import { flushDevOutbox } from "../services/whatsapp";
import { handleIncomingMessage } from "../services/conversation";
import {
  adminConfirmBooking,
  adminDeclineBooking,
  confirmProposedDriver,
  declineProposedDriver,
  startBooking,
  completeBooking,
} from "../services/booking";
import { config } from "../config/env";

const router = express.Router();

// Guard — all sim routes disabled in production
router.use((_req, res, next) => {
  if (!config.simulatorMode) {
    res.status(403).json({ success: false, error: "Simulator mode is not enabled" });
    return;
  }
  next();
});

// ─── Utility ──────────────────────────────────────────────────────────────────

router.get("/outbox", (_req, res) => {
  res.json({ success: true, messages: flushDevOutbox() });
});

router.get("/bookings", async (_req, res, next) => {
  try {
    const bookings = await prisma.rideRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { driver: { select: { id: true, firstName: true, lastName: true } } },
    });
    res.json({ success: true, bookings });
  } catch (err) { next(err); }
});

router.get("/drivers", async (_req, res, next) => {
  try {
    const drivers = await prisma.driver.findMany({
      orderBy: { firstName: "asc" },
      select: {
        id: true, firstName: true, lastName: true, phone: true,
        isOnline: true, whatsappEnabled: true, maxPassengers: true, maxLuggage: true,
      },
    });
    res.json({ success: true, drivers });
  } catch (err) { next(err); }
});

// ─── Path B: WhatsApp Customer Conversation ───────────────────────────────────

// Simulate a customer sending one WhatsApp message to the bot.
// Send messages one at a time to step through the conversation.
// Body: { phone: "16045550100", message: "Hello" }
// Returns the bot's replies in `responses`.
router.post("/whatsapp/customer", async (req, res, next) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      res.status(400).json({ success: false, error: "Missing phone or message" });
      return;
    }
    const jid = phone.includes("@") ? phone : `${phone.replace(/\D/g, "")}@c.us`;
    await handleIncomingMessage(jid, message);
    const responses = flushDevOutbox();
    res.json({ success: true, responses });
  } catch (err) { next(err); }
});

// Check what step the customer's conversation is currently at
router.get("/whatsapp/state", async (req, res, next) => {
  try {
    const phone = req.query.phone as string;
    if (!phone) {
      res.status(400).json({ success: false, error: "Missing phone query param" });
      return;
    }
    const jid = phone.includes("@") ? phone : `${phone.replace(/\D/g, "")}@c.us`;
    const state = await prisma.conversationState.findUnique({ where: { phone: jid } });
    res.json({ success: true, state });
  } catch (err) { next(err); }
});

// ─── Admin Controls ───────────────────────────────────────────────────────────

router.post("/bookings/:id/admin-confirm", async (req, res) => {
  try {
    const result = await adminConfirmBooking(req.params.id);
    const responses = flushDevOutbox();
    res.json({ success: true, result, responses });
  } catch (err: unknown) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.post("/bookings/:id/admin-decline", async (req, res) => {
  try {
    await adminDeclineBooking(req.params.id);
    const responses = flushDevOutbox();
    res.json({ success: true, responses });
  } catch (err: unknown) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ─── Customer Driver Confirmation ─────────────────────────────────────────────

router.post("/bookings/:id/customer-yes", async (req, res) => {
  try {
    await confirmProposedDriver(req.params.id);
    const responses = flushDevOutbox();
    res.json({ success: true, responses });
  } catch (err: unknown) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.post("/bookings/:id/customer-no", async (req, res) => {
  try {
    await declineProposedDriver(req.params.id);
    const responses = flushDevOutbox();
    res.json({ success: true, responses });
  } catch (err: unknown) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ─── Driver Controls ──────────────────────────────────────────────────────────

router.post("/drivers/:id/online", async (req, res, next) => {
  try {
    const driver = await prisma.driver.update({
      where: { id: req.params.id },
      data: { isOnline: true },
      select: { id: true, firstName: true, lastName: true, isOnline: true },
    });
    res.json({ success: true, driver });
  } catch (err) { next(err); }
});

router.post("/drivers/:id/offline", async (req, res, next) => {
  try {
    const driver = await prisma.driver.update({
      where: { id: req.params.id },
      data: { isOnline: false },
      select: { id: true, firstName: true, lastName: true, isOnline: true },
    });
    res.json({ success: true, driver });
  } catch (err) { next(err); }
});

// Simulate driver picking up customer — body: { bookingId }
router.post("/drivers/:id/start", async (req, res) => {
  try {
    const { bookingId } = req.body;
    if (!bookingId) {
      res.status(400).json({ success: false, error: "Missing bookingId" });
      return;
    }
    const booking = await startBooking(bookingId);
    const responses = flushDevOutbox();
    res.json({ success: true, booking: { id: booking.id, status: booking.status }, responses });
  } catch (err: unknown) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// Simulate driver dropping off customer — body: { bookingId }
router.post("/drivers/:id/complete", async (req, res) => {
  try {
    const { bookingId } = req.body;
    if (!bookingId) {
      res.status(400).json({ success: false, error: "Missing bookingId" });
      return;
    }
    const booking = await completeBooking(bookingId);
    const responses = flushDevOutbox();
    res.json({ success: true, booking: { id: booking.id, status: booking.status }, responses });
  } catch (err: unknown) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : "Unknown error" });
  }
});

export default router;