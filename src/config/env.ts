export const config = {
  port: parseInt(process.env.PORT || "5000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  database: {
    url: process.env.DATABASE_URL,
  },
  jwtSecret: process.env.JWT_SECRET || "dev-secret",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
  apiKey: process.env.API_KEY || "",
  adminPhone: process.env.ADMIN_PHONE || "",
  blockedPhones: (process.env.BLOCKED_PHONES || "").split(",").filter(Boolean),
  tomtom: {
    apiKey: process.env.TOMTOM_API_KEY || "",
    baseUrl: process.env.TOMTOM_BASE_URL || "https://api.tomtom.com",
  },
  // How many minutes before scheduled pickup time we dispatch drivers
  scheduleDispatchWindowMinutes: parseInt(process.env.SCHEDULE_DISPATCH_WINDOW_MINUTES || "45", 10),
};

export const validateConfig = () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("Missing DATABASE_URL in .env");
  }
};