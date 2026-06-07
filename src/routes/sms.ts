import { Router, Request, Response } from "express";
import { handleIncomingMessage } from "../services/conversation";
import { isAdmin, handleAdminCommand } from "../services/admin/index";

const router = Router();

// POST /api/sms/incoming — SMSGate calls this when the phone receives a text
router.post("/incoming", async (req: Request, res: Response) => {
  // Verify signing key if configured
  const secret = process.env.SMS_WEBHOOK_SECRET;
  if (secret) {
    const provided = req.headers["x-signing-key"] ?? req.headers["authorization"]?.replace(/^Bearer\s+/i, "");
    if (provided !== secret) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  // sms-gate.app webhook payload
  const rawPhone: string = req.body.phoneNumber ?? req.body.from ?? "";
  const message: string = req.body.message ?? req.body.body ?? "";

  if (!rawPhone || !message) {
    res.status(400).json({ error: "Missing phoneNumber or message" });
    return;
  }

  // Normalize to digits with country code (e.g. "17782518913")
  const digits = rawPhone.replace(/\D/g, "");
  const phone = digits.length === 10 ? `1${digits}` : digits;

  console.log(`[sms/incoming] from=${phone} message="${message.slice(0, 60)}"`);

  try {
    if (await isAdmin(phone)) {
      await handleAdminCommand(phone, message);
    } else {
      await handleIncomingMessage(phone, message);
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error("[sms/incoming] Error:", err?.message);
    res.status(500).json({ error: "Processing failed" });
  }
});

export default router;