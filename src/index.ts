import "dotenv/config";
import express from "express";
import cors from "cors";
import whatsappRoutes from "./routes/whatsapp";
import { startWhatsApp } from "./services/whatsapp";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/whatsapp", whatsappRoutes);

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  startWhatsApp();
});
