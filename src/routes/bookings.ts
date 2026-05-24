import express from "express";
import * as bookingController from "../controllers/bookingController";

const router = express.Router();

// Customer
router.post("/book-ride", bookingController.bookRide);

// Admin / listing
router.get("/bookings", bookingController.getBookings);
router.get("/bookings/:id", bookingController.getBooking);
router.put("/bookings/:id/cancel", bookingController.cancelBooking);
router.put("/bookings/:id/assign-driver", bookingController.assignDriver);

// Driver actions
router.post("/bookings/:id/accept", bookingController.acceptBooking);
router.put("/bookings/:id/start", bookingController.startBooking);
router.put("/bookings/:id/complete", bookingController.completeBooking);

export default router;