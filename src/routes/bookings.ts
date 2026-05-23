import express from 'express';
// import * as bookingController from '../controllers/bookingController';

const router = express.Router();

// Test route - just to verify routing works
router.get('/test', (req, res) => {
    res.json({ message: 'Bookings API is working!' });
});

// TODO: Uncomment these when ready
// router.post('/book-ride', bookingController.bookRide);
// router.get('/bookings', bookingController.getBookings);

export default router;