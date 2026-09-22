import { Router } from 'express';
import { asyncHandler } from '../lib/errors.js';
import { requireAuth } from '../auth/middleware.js';
import { validate, createRideSchema, searchSchema } from '../lib/validate.js';
import * as rideService from '../services/ride.service.js';
import { findMatchingRides, explainMatching } from '../services/matching.service.js';

export const ridesRouter = Router();
ridesRouter.use(requireAuth); // no anonymous access (§6)

// Post a ride.
ridesRouter.post('/', asyncHandler(async (req, res) => {
  const data = validate(createRideSchema, req.body);
  const ride = await rideService.postRide(req.userId, data);
  res.status(201).json(ride);
}));

// Search / match. GET with query params; validated & coerced by Zod.
ridesRouter.get('/search', asyncHandler(async (req, res) => {
  const q = validate(searchSchema, {
    originLat: Number(req.query.originLat),
    originLng: Number(req.query.originLng),
    destLat: Number(req.query.destLat),
    destLng: Number(req.query.destLng),
    departAfter: req.query.departAfter,
    departBefore: req.query.departBefore,
    radiusMeters: req.query.radiusMeters ? Number(req.query.radiusMeters) : undefined,
  });
  const rides = await findMatchingRides(q);
  res.json({ count: rides.length, rides });
}));

// The query plan — for the walkthrough / load test (§8).
ridesRouter.get('/search/explain', asyncHandler(async (req, res) => {
  const q = validate(searchSchema, {
    originLat: Number(req.query.originLat), originLng: Number(req.query.originLng),
    destLat: Number(req.query.destLat), destLng: Number(req.query.destLng),
    departAfter: req.query.departAfter, departBefore: req.query.departBefore,
    radiusMeters: req.query.radiusMeters ? Number(req.query.radiusMeters) : undefined,
  });
  res.json(await explainMatching(q));
}));

// The driver's own rides.
ridesRouter.get('/mine', asyncHandler(async (req, res) => {
  res.json(await rideService.listDriverRides(req.userId));
}));

// View one ride (contact visibility applied inside the service).
ridesRouter.get('/:id', asyncHandler(async (req, res) => {
  res.json(await rideService.getRideForViewer(req.params.id, req.userId));
}));

// Cancel the whole ride (driver only).
ridesRouter.post('/:id/cancel', asyncHandler(async (req, res) => {
  res.json(await rideService.cancelRide(req.params.id, req.userId));
}));

// Mark completed — freezes the ride (driver only).
ridesRouter.post('/:id/complete', asyncHandler(async (req, res) => {
  res.json(await rideService.completeRide(req.params.id, req.userId));
}));
