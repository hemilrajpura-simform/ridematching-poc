/**
 * THE test this POC lives or dies on (§6):
 * fire concurrent booking requests for the LAST seat and assert exactly one wins.
 *
 * This is NOT two sequential requests that happen to look fine — bookSeat is
 * called for every rider simultaneously with Promise.allSettled, so the
 * transactions genuinely race on separate connections.
 *
 * Run: npm test   (needs a test DB; see README "Testing").
 */
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db.js';
import { bookSeat } from '../src/services/booking.service.js';
import { resetDb, makeUser, makeRide } from './helpers.js';

before(async () => { await resetDb(); });
after(async () => { await prisma.$disconnect(); });
beforeEach(async () => { await resetDb(); });

test('12 riders race for the LAST seat — exactly one succeeds', async () => {
  const driver = await makeUser();
  const ride = await makeRide(driver.id, { seatsTotal: 1 });
  const riders = await Promise.all(Array.from({ length: 12 }, () => makeUser()));

  // Fire all bookings at the SAME time.
  const results = await Promise.allSettled(riders.map((r) => bookSeat(ride.id, r.id)));

  const succeeded = results.filter((r) => r.status === 'fulfilled');
  const failed = results.filter((r) => r.status === 'rejected');

  assert.equal(succeeded.length, 1, 'exactly one booking should succeed');
  assert.equal(failed.length, 11, 'the other eleven must be rejected');

  // The database itself must agree: never oversold.
  const confirmed = await prisma.booking.count({ where: { rideId: ride.id, status: 'CONFIRMED' } });
  assert.equal(confirmed, 1, 'confirmed bookings must equal the 1 seat — never 2');
});

test('3 seats, 10 racers — exactly three succeed, seat count never negative', async () => {
  const driver = await makeUser();
  const ride = await makeRide(driver.id, { seatsTotal: 3 });
  const riders = await Promise.all(Array.from({ length: 10 }, () => makeUser()));

  const results = await Promise.allSettled(riders.map((r) => bookSeat(ride.id, r.id)));
  const succeeded = results.filter((r) => r.status === 'fulfilled').length;

  assert.equal(succeeded, 3, 'exactly three seats fill');
  const confirmed = await prisma.booking.count({ where: { rideId: ride.id, status: 'CONFIRMED' } });
  assert.equal(confirmed, 3);
});

test('cancelling frees a seat immediately — a new rider can then book', async () => {
  const driver = await makeUser();
  const ride = await makeRide(driver.id, { seatsTotal: 1 });
  const [a, b] = await Promise.all([makeUser(), makeUser()]);

  await bookSeat(ride.id, a.id);
  await assert.rejects(() => bookSeat(ride.id, b.id), /No seats available/);

  const { cancelBooking } = await import('../src/services/booking.service.js');
  const mine = await prisma.booking.findFirst({ where: { rideId: ride.id, riderId: a.id } });
  await cancelBooking(mine.id, a.id);

  // Seat is free again the instant the cancel commits.
  const ok = await bookSeat(ride.id, b.id);
  assert.equal(ok.seatsAvailable, 0);
});
