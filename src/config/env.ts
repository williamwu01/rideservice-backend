export const config = {
  port: parseInt(process.env.PORT || "5000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  simulatorMode: process.env.SIMULATOR_MODE === "true",
  database: {
    url: process.env.DATABASE_URL,
  },
  jwtSecret: process.env.JWT_SECRET || "dev-secret",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
  apiKey: process.env.API_KEY || "",
  // adminPhone is kept for backwards compat but admin routing now uses the Admin DB table
  adminPhone: process.env.ADMIN_PHONE || "",
  blockedPhones: (process.env.BLOCKED_PHONES || "").split(",").filter(Boolean),
  tomtom: {
    apiKey: process.env.TOMTOM_API_KEY || "",
    baseUrl: process.env.TOMTOM_BASE_URL || "https://api.tomtom.com",
  },
  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID || "",
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || "",
    baseUrl: process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com",
  },
  scheduleDispatchWindowMinutes: parseInt(
    process.env.SCHEDULE_DISPATCH_WINDOW_MINUTES || "45",
    10
  ),
  smsGateway: {
    url: process.env.SMS_GATEWAY_URL || "",
    user: process.env.SMS_GATEWAY_USER || "",
    pass: process.env.SMS_GATEWAY_PASS || "",
  },
};

export const validateConfig = () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("Missing DATABASE_URL in .env");
  }
  if (!process.env.TOMTOM_API_KEY) {
    console.warn("⚠️  TOMTOM_API_KEY not set — fare estimates will fail");
  }
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
    console.warn("⚠️  PayPal credentials not set — payments will fail");
  }
};