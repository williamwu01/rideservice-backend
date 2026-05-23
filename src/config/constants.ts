// Booking statuses - the different states a booking can be in
export const BOOKING_STATUS = {
  PENDING: 'pending',        // Just created, waiting for driver
  ASSIGNED: 'assigned',      // Driver accepted and is on the way
  COMPLETED: 'completed',    // Ride finished
  CANCELLED: 'cancelled',    // Cancelled by customer or admin
} as const;

// Driver statuses - whether a driver is available
export const DRIVER_STATUS = {
  ONLINE: 'online',          // Available for bookings
  OFFLINE: 'offline',        // Not available
} as const;