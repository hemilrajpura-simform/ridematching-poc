/**
 * Zod schemas + a validate() helper. Every route validates its input here, so
 * malformed requests are rejected at the edge with a 400 and a clear message —
 * "before it reaches your business logic", as the spec requires.
 */
import { z } from 'zod';
import { badRequest } from './errors.js';

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

export const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  phone: z.string().min(5),
  password: z.string().min(8, 'password must be at least 8 characters'),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createRideSchema = z.object({
  originLabel: z.string().min(1),
  destLabel: z.string().min(1),
  originLat: lat,
  originLng: lng,
  destLat: lat,
  destLng: lng,
  // Reject a departure time in the past — a §6 check.
  departureTime: z.coerce.date().refine((d) => d.getTime() > Date.now(), {
    message: 'departureTime must be in the future',
  }),
  // Reject a seat count of zero — a §6 check.
  seatsTotal: z.number().int().positive('seatsTotal must be at least 1'),
  estimatedCost: z.number().nonnegative(),
});

export const searchSchema = z.object({
  originLat: lat,
  originLng: lng,
  destLat: lat,
  destLng: lng,
  // Rider's acceptable departure window.
  departAfter: z.coerce.date(),
  departBefore: z.coerce.date(),
  // Optional override of the default match radius (metres).
  radiusMeters: z.number().positive().max(50000).optional(),
}).refine((v) => v.departBefore > v.departAfter, {
  message: 'departBefore must be after departAfter',
  path: ['departBefore'],
});

/** Parse `data` with `schema`, or throw a 400 AppError with field details. */
export function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest('Validation failed', result.error.flatten().fieldErrors);
  }
  return result.data;
}
