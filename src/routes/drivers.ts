import express from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import fs from "fs";
import * as driverController from "../controllers/driverController";
import { requireApiKey } from "../middleware/apiKey";

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(process.cwd(), "uploads", "drivers");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

const router = express.Router();

router.post("/drivers", requireApiKey, upload.single("photo"), driverController.createDriver);
router.get("/drivers", requireApiKey, driverController.getDrivers);
router.get("/drivers/:id", requireApiKey, driverController.getDriver);
router.put("/drivers/:id", requireApiKey, upload.single("photo"), driverController.updateDriver);
router.patch("/drivers/:id/location", requireApiKey, driverController.updateLocation);
router.delete("/drivers/:id", requireApiKey, driverController.deleteDriver);

export default router;
