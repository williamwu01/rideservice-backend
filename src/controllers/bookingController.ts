import { Request, Response, NextFunction } from "express";
import * as bookingService from "../services/booking";

export const bookRide = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone, firstName, lastName, pickup, destination } = req.body;

    if (!phone || !firstName || !lastName || !pickup || !destination) {
      res.status(400).json({ success: false, error: "Missing required fields: phone, firstName, lastName, pickup, destination" });
      return;
    }

    const booking = await bookingService.createBooking({ phone, firstName, lastName, pickup, destination });

    res.status(201).json({ success: true, booking });
  } catch (err) {
    next(err);
  }
};

export const getBookings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as string | undefined;
    const driverId = req.query.driverId as string | undefined;
    const bookings = await bookingService.getAllBookings({ status, driverId });
    res.json({ success: true, bookings });
  } catch (err) {
    next(err);
  }
};

export const getBooking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const booking = await bookingService.getBooking(id);
    if (!booking) {
      res.status(404).json({ success: false, error: "Booking not found" });
      return;
    }
    res.json({ success: true, booking });
  } catch (err) {
    next(err);
  }
};

export const cancelBooking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const booking = await bookingService.cancelBooking(req.params.id as string);
    res.json({ success: true, booking });
  } catch (err) {
    next(err);
  }
};

export const assignDriver = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { driverId } = req.body;
    if (!driverId) {
      res.status(400).json({ success: false, error: "Missing driverId" });
      return;
    }
    const booking = await bookingService.assignDriver(req.params.id as string, driverId);
    res.json({ success: true, booking });
  } catch (err) {
    next(err);
  }
};

export const acceptBooking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { driverId } = req.body;
    if (!driverId) {
      res.status(400).json({ success: false, error: "Missing driverId" });
      return;
    }
    const booking = await bookingService.acceptBooking(req.params.id as string, driverId);
    res.json({ success: true, booking });
  } catch (err) {
    next(err);
  }
};

export const startBooking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const booking = await bookingService.startBooking(req.params.id as string);
    res.json({ success: true, booking });
  } catch (err) {
    next(err);
  }
};

export const completeBooking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const booking = await bookingService.completeBooking(req.params.id as string);
    res.json({ success: true, booking });
  } catch (err) {
    next(err);
  }
};