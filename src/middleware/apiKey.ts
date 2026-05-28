import { Request, Response, NextFunction } from "express";
import { config } from "../config/env";

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  if (!config.apiKey) {
    console.warn("[auth] API_KEY not set — blocking all admin requests");
    res.status(503).json({ success: false, error: "API key not configured on server" });
    return;
  }

  const provided = req.headers["x-api-key"];

  if (!provided || provided !== config.apiKey) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  next();
}
