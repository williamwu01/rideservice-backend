import { config } from "../config/env";

const PAYPAL_TIMEOUT_MS = 15_000;

function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAYPAL_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

async function getAccessToken(): Promise<string> {
  const credentials = Buffer.from(
    `${config.paypal.clientId}:${config.paypal.clientSecret}`
  ).toString("base64");

  const res = await fetchWithTimeout(`${config.paypal.baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    console.error(`[PayPal] auth failed ${res.status} — clientId starts with: "${config.paypal.clientId.slice(0, 8)}" baseUrl: "${config.paypal.baseUrl}"`);
    throw new Error(`PayPal auth failed: ${res.status}`);
  }
  const data = await res.json() as any;
  return data.access_token;
}

export async function createOrder(amount: number, bookingId: string, returnUrl?: string, cancelUrl?: string) {
  const token = await getAccessToken();

  const res = await fetchWithTimeout(`${config.paypal.baseUrl}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: bookingId,
          description: "Loop Rideshare — Ride Payment",
          amount: {
            currency_code: "CAD",
            value: amount.toFixed(2),
          },
        },
      ],
      application_context: {
        brand_name: "Loop Rideshare",
        landing_page: "NO_PREFERENCE",
        user_action: "PAY_NOW",
        ...(returnUrl && { return_url: returnUrl }),
        ...(cancelUrl && { cancel_url: cancelUrl }),
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json() as any;
    throw new Error(`PayPal create order failed: ${err.message || res.status}`);
  }

  const data = await res.json() as any;
  const approveUrl = data.links?.find((l: any) => l.rel === "approve")?.href;

  return {
    orderId: data.id as string,
    status: data.status as string,
    approveUrl: approveUrl as string,
  };
}

export async function captureOrder(orderId: string) {
  const token = await getAccessToken();

  const res = await fetchWithTimeout(
    `${config.paypal.baseUrl}/v2/checkout/orders/${orderId}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!res.ok) {
    const err = await res.json() as any;
    throw new Error(`PayPal capture failed: ${err.message || res.status}`);
  }

  const data = await res.json() as any;
  const capture = data.purchase_units?.[0]?.payments?.captures?.[0];

  return {
    orderId: data.id as string,
    status: data.status as string,          // "COMPLETED"
    captureId: capture?.id as string,
    amount: parseFloat(capture?.amount?.value || "0"),
  };
}

export async function getOrderDetails(orderId: string) {
  const token = await getAccessToken();

  const res = await fetch(
    `${config.paypal.baseUrl}/v2/checkout/orders/${orderId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) throw new Error(`PayPal get order failed: ${res.status}`);
  return res.json();
}