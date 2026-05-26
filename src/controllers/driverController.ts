import { Request, Response, NextFunction } from "express";
import * as driverService from "../services/driver";

export const createDriver = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { firstName, lastName, email, phone, carModel, carNameplate, whatsappEnabled } = req.body;

    if (!firstName || !lastName || !email || !phone || !carModel || !carNameplate) {
      res.status(400).json({
        success: false,
        error: "Missing required fields: firstName, lastName, email, phone, carModel, carNameplate",
      });
      return;
    }

    const photo = req.file ? `uploads/drivers/${req.file.filename}` : undefined;

    const driver = await driverService.createDriver({
      firstName,
      lastName,
      email,
      phone,
      carModel,
      carNameplate,
      photo,
      whatsappEnabled: whatsappEnabled !== undefined ? whatsappEnabled === "true" || whatsappEnabled === true : true,
    });

    res.status(201).json({ success: true, driver });
  } catch (err) {
    next(err);
  }
};

export const getDrivers = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const drivers = await driverService.getAllDrivers();
    res.json({ success: true, drivers });
  } catch (err) {
    next(err);
  }
};

export const getDriver = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const driver = await driverService.getDriver(req.params.id as string);
    if (!driver) {
      res.status(404).json({ success: false, error: "Driver not found" });
      return;
    }
    res.json({ success: true, driver });
  } catch (err) {
    next(err);
  }
};

export const updateDriver = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { firstName, lastName, phone, carModel, carNameplate, whatsappEnabled } = req.body;

    const photo = req.file ? `uploads/drivers/${req.file.filename}` : undefined;

    const updates: Record<string, unknown> = {
      ...(firstName && { firstName }),
      ...(lastName && { lastName }),
      ...(phone && { phone }),
      ...(carModel && { carModel }),
      ...(carNameplate && { carNameplate }),
      ...(photo && { photo }),
      ...(whatsappEnabled !== undefined && {
        whatsappEnabled: whatsappEnabled === "true" || whatsappEnabled === true,
      }),
    };

    const driver = await driverService.updateDriver(req.params.id as string, updates);
    res.json({ success: true, driver });
  } catch (err) {
    next(err);
  }
};

export const deleteDriver = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await driverService.deleteDriver(req.params.id as string);
    res.json({ success: true, message: "Driver deleted" });
  } catch (err) {
    next(err);
  }
};
