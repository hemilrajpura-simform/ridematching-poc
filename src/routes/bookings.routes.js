import { Router } from 'express';
import { asyncHandler } from '../lib/errors.js';
import { requireAuth } from '../auth/middleware.js';
import { bookSeat, cancelBooking } from '../services/booking.service.js';
import { listRiderBookings } from '../services/ride.service.js';

export const bookingsRouter = Router();
bookingsRouter.use(requireAuth);

// Book a seat on a ride. rideId in the body.
bookingsRouter.post('/', asyncHandler(async (req, res) => {
  const rideId = String(req.body.rideId ?? '');
  if (!rideId) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'rideId is required' } });
  const result = await bookSeat(rideId, req.userId);
  res.status(201).json(result);
}));

// A rider's own bookings.
bookingsRouter.get('/mine', asyncHandler(async (req, res) => {
  res.json(await listRiderBookings(req.userId));
}));

// Cancel a booking (rider who owns it, or the ride's driver).
bookingsRouter.post('/:id/cancel', asyncHandler(async (req, res) => {
  res.json(await cancelBooking(req.params.id, req.userId));
}));
