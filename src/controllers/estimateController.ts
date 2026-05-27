import { Request, Response, NextFunction } from "express";
import { calculateEstimate } from "../services/estimate";

export const getEstimate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pickup = req.query.pickup as string;
    const destination = req.query.destination as string;

    if (!pickup || !destination) {
      res.status(400).json({ success: false, error: "Missing required query params: pickup, destination" });
      return;
    }

    const estimate = await calculateEstimate(pickup, destination);
    res.json({ success: true, estimate });
  } catch (err: any) {
    if (err.message?.includes("No location found")) {
      res.status(422).json({ success: false, error: err.message });
      return;
    }
    next(err);
  }
};
