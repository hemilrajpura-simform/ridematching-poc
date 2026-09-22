/**
 * Test helpers: a clean DB and factory functions. Requires a running Postgres
 * with the schema applied (npm run db:setup) pointed at a TEST database.
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../src/db.js';

export async function resetDb() {
  // Order matters (FKs). Truncate is fast and resets nothing we rely on.
  await prisma.$executeRawUnsafe('TRUNCATE "audit_logs","bookings","rides","users" RESTART IDENTITY CASCADE');
}

let n = 0;
export async function makeUser(overrides = {}) {
  n += 1;
  return prisma.user.create({
    data: {
      email: overrides.email ?? `user${n}_${Date.now()}@test.dev`,
      name: overrides.name ?? `User ${n}`,
      phone: overrides.phone ?? `+91-90000-000${n}`,
      password: await bcrypt.hash('password123', 4),
    },
  });
}

export async function makeRide(driverId, overrides = {}) {
  return prisma.ride.create({
    data: {
      driverId,
      originLabel: 'A', destLabel: 'B',
      originLat: 23.0225, originLng: 72.5714, // Ahmedabad
      destLat: 23.2156, destLng: 72.6369,     // Gandhinagar
      departureTime: new Date(Date.now() + 3600_000),
      seatsTotal: overrides.seatsTotal ?? 1,
      estimatedCost: overrides.estimatedCost ?? 400,
      ...overrides,
    },
  });
}
