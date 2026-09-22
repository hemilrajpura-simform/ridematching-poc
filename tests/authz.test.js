/**
 * Authorization tests (§6): a rider can cancel only THEIR booking, a driver only
 * THEIR ride — even when they hold the exact record id. Proven with code, not a
 * UI click.
 */
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db.js';
import { bookSeat, cancelBooking } from '../src/services/booking.service.js';
import { cancelRide, completeRide, getRideForViewer } from '../src/services/ride.service.js';
import { resetDb, makeUser, makeRide } from './helpers.js';

before(async () => { await resetDb(); });
after(async () => { await prisma.$disconnect(); });
beforeEach(async () => { await resetDb(); });

test('a stranger cannot cancel someone else\'s booking, even with its id', async () => {
  const driver = await makeUser();
  const rider = await makeUser();
  const stranger = await makeUser();
  const ride = await makeRide(driver.id, { seatsTotal: 2 });
  const { booking } = await bookSeat(ride.id, rider.id);

  await assert.rejects(() => cancelBooking(booking.id, stranger.id));

  // Booking is untouched.
  const still = await prisma.booking.findUnique({ where: { id: booking.id } });
  assert.equal(still.status, 'CONFIRMED');
});

test('the ride driver CAN cancel a rider\'s booking on their ride', async () => {
  const driver = await makeUser();
  const rider = await makeUser();
  const ride = await makeRide(driver.id, { seatsTotal: 2 });
  const { booking } = await bookSeat(ride.id, rider.id);

  const res = await cancelBooking(booking.id, driver.id);
  assert.equal(res.booking.status, 'CANCELLED');
});

test('a non-owner cannot cancel or complete a ride', async () => {
  const driver = await makeUser();
  const notDriver = await makeUser();
  const ride = await makeRide(driver.id);

  await assert.rejects(() => cancelRide(ride.id, notDriver.id), /owner/);
  await assert.rejects(() => completeRide(ride.id, notDriver.id), /owner/);
});

test('completed rides are frozen: no new bookings', async () => {
  const driver = await makeUser();
  const rider = await makeUser();
  const ride = await makeRide(driver.id, { seatsTotal: 5 });
  await completeRide(ride.id, driver.id);

  await assert.rejects(() => bookSeat(ride.id, rider.id), /completed/);
});

test('contact details hidden in search-like view, shown only after confirmed booking', async () => {
  const driver = await makeUser({ phone: '+91-99999-11111' });
  const rider = await makeUser();
  const outsider = await makeUser();
  const ride = await makeRide(driver.id, { seatsTotal: 2 });

  // Outsider (no booking) sees no driver phone.
  const asOutsider = await getRideForViewer(ride.id, outsider.id);
  assert.equal(asOutsider.driver.phone, null);

  // After a confirmed booking, the rider sees the driver's phone.
  await bookSeat(ride.id, rider.id);
  const asRider = await getRideForViewer(ride.id, rider.id);
  assert.equal(asRider.driver.phone, '+91-99999-11111');

  // The driver sees the rider roster with phones.
  const asDriver = await getRideForViewer(ride.id, driver.id);
  assert.ok(asDriver.riders.some((r) => r.id === rider.id && r.phone));
});
