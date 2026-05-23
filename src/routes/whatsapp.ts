import { Router, Request, Response } from "express";
import { startConversation } from "../services/conversation";

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
    const result = await startConversation(normalized);
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[whatsapp/start] Error:", err?.message, err?.stack);
    res.status(500).json({ error: "Failed to start conversation" });
  }
});

export default router;
