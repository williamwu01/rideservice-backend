import "dotenv/config";
import path from "path";
import express from "express";
import cors from "cors";
import whatsappRoutes from "./routes/whatsapp";
import bookingRoutes from "./routes/bookings";
import driverRoutes from "./routes/drivers";
import estimateRoutes from "./routes/estimate";
import paymentRoutes from "./routes/payment";
import { startWhatsApp } from "./services/whatsapp";
import { startScheduler } from "./services/scheduler";
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
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/whatsapp", whatsappRoutes);
app.use("/api", bookingRoutes);
app.use("/api", driverRoutes);
app.use("/api", estimateRoutes);
app.use("/api", paymentRoutes);

// Error handler must be last
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT} (${config.nodeEnv})`);
  startWhatsApp();
  startScheduler();
});

process.on("SIGINT", () => {
  console.log("Shutting down...");
  server.close();
  process.exit(0);
});
