import { config } from "../config/env";

/**
 * Sends an SMS via the Android SMS Gateway app (sms-gate.app).
 * API docs: https://sms-gate.app/api/
 */
export async function sendSms(phone: string, message: string): Promise<void> {
  const { url, user, pass } = config.smsGateway;

  if (!url || !user || !pass) {
    throw new Error("SMS Gateway not configured. Set SMS_GATEWAY_URL, SMS_GATEWAY_USER, SMS_GATEWAY_PASS in .env");
  }

  // Normalize: strip non-digits, ensure country code
  const digits = phone.replace(/\D/g, "");
  const e164 = digits.startsWith("1") ? `+${digits}` : `+1${digits}`;

  const body = JSON.stringify({
    message,
    phoneNumbers: [e164],
    withDeliveryReport: true,
  });

  const credentials = Buffer.from(`${user}:${pass}`).toString("base64");

  const res = await fetch(`${url}/3rdparty/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${credentials}`,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SMS Gateway error ${res.status}: ${text}`);
  }

  console.log(`[sms] ✅ Sent to ${e164}`);
}
