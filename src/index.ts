import "dotenv/config";
import express from "express";
import cors from "cors";
import whatsappRoutes from "./routes/whatsapp";
import bookingRoutes from "./routes/bookings";
import { startWhatsApp } from "./services/whatsapp";
import { config, validateConfig } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";

// Validate config before starting
try {
  validateConfig();
} catch (error) {
  console.error("❌ Config error:", error);
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/whatsapp", whatsappRoutes);
app.use("/api", bookingRoutes);

// Error handler must be last
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT} (${config.nodeEnv})`);
  //comment out for now 
  startWhatsApp();
});

process.on("SIGINT", () => {
  console.log("Shutting down...");
  server.close();
  process.exit(0);
});
