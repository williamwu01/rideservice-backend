import { Request, Response, NextFunction } from "express";
import * as bookingService from "../services/booking";

export const bookRide = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone, firstName, lastName, pickup, destination, pickupTime, passengers, luggage, estimatedFare, distanceKm, durationMin } = req.body;

    if (!phone || !firstName || !lastName || !pickup || !destination) {
      res.status(400).json({ success: false, error: "Missing required fields: phone, firstName, lastName, pickup, destination" });
      return;
    }

    const booking = await bookingService.createBooking({
      phone,
      firstName,
      lastName,
      pickup,
      destination,
      pickupTime,
      passengers: passengers !== undefined ? parseInt(passengers, 10) : undefined,
      luggage: luggage !== undefined ? parseInt(luggage, 10) : undefined,
      estimatedFare: estimatedFare !== undefined ? parseFloat(estimatedFare) : undefined,
      distanceKm: distanceKm !== undefined ? parseFloat(distanceKm) : undefined,
      durationMin: durationMin !== undefined ? parseFloat(durationMin) : undefined,
    });

    res.status(201).json({ success: true, booking });
  } catch (err) {
    next(err);
  }
};

export const bookRideWeb = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      phone, firstName, lastName, pickup, destination,
      passengers, luggage, scheduledPickupAt, pickupTime,
      estimatedFare, distanceKm, durationMin, specialRequests,
    } = req.body;

    if (!phone || !firstName || !lastName || !pickup || !destination) {
      res.status(400).json({ success: false, error: "Missing required fields" });
      return;
    }

    const pax = passengers ? parseInt(passengers, 10) : 1;
    const bags = luggage ? parseInt(luggage, 10) : 0;
    const pickupDate = scheduledPickupAt ? new Date(scheduledPickupAt) : null;

    const driver = await bookingService.findDriverForWebBooking(pax, bags, pickupDate, pickup);
    if (!driver) {
      res.status(409).json({
        success: false,
        error: "No drivers available for this timeslot. Please try a different time or contact us directly.",
      });
      return;
    }

    const booking = await bookingService.createWebBooking({
      phone,
      firstName,
      lastName,
      pickup,
      destination,
      passengers: pax,
      luggage: bags,
      scheduledPickupAt: pickupDate,
      pickupTime: pickupTime || undefined,
      estimatedFare: estimatedFare ? parseFloat(estimatedFare) : undefined,
      distanceKm: distanceKm ? parseFloat(distanceKm) : undefined,
      durationMin: durationMin ? parseFloat(durationMin) : undefined,
      specialRequests,
      driverId: driver.id,
    });

    res.status(201).json({
      success: true,
      bookingId: booking.id,
      estimatedFare: booking.estimatedFare,
      driver: {
        firstName: driver.firstName,
        lastName: driver.lastName,
        carModel: driver.carModel,
        carNameplate: driver.carNameplate,
        photo: driver.photo,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const releaseWebReservation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await bookingService.releaseWebReservation(req.params.id as string);
    res.json({ success: true });
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
    const booking = await bookingService.assignDriver(req.params.id as string, driverId);
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