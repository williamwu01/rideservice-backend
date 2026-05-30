import express from "express";
import * as bookingController from "../controllers/bookingController";
import { requireApiKey } from "../middleware/apiKey";

const router = express.Router();

// Customer — open (triggered from the frontend booking widget)
router.post("/book-ride", bookingController.bookRide);
router.post("/book-ride-web", bookingController.bookRideWeb);

// Admin only
router.get("/bookings", requireApiKey, bookingController.getBookings);
router.get("/bookings/:id", requireApiKey, bookingController.getBooking);
router.put("/bookings/:id/cancel", requireApiKey, bookingController.cancelBooking);
router.put("/bookings/:id/assign-driver", requireApiKey, bookingController.assignDriver);

// Driver actions — admin dashboard use only (real drivers use WhatsApp)
router.post("/bookings/:id/accept", requireApiKey, bookingController.acceptBooking);
router.put("/bookings/:id/start", requireApiKey, bookingController.startBooking);
router.put("/bookings/:id/complete", requireApiKey, bookingController.completeBooking);

export default router;