/**
 * booking.service.js — the sharpest test in this POC (§3.3, §6).
 *
 * THE GUARANTEE: two riders booking the last seat at the same instant must not
 * BOTH succeed.
 *
 * HOW (and why this approach): inside one database transaction we take a row
 * lock on the RIDE (SELECT ... FOR UPDATE), THEN count confirmed bookings under
 * that lock, and only insert if there is room. Two concurrent requests cannot
 * both hold the ride's lock — the second blocks until the first commits, then
 * re-reads the now-updated count and correctly sees the ride is full.
 *
 * Availability is DERIVED (seatsTotal - confirmed count), so there is no
 * denormalised seat counter that can drift or go negative.
 *
 * Walkthrough — why not the alternatives?
 *   • "Just count then insert" (no lock): the classic bug. Both requests read
 *     "0 booked, 1 seat", both insert -> oversold. (Provably: the scaffold's
 *     concurrency test fails against this version.)
 *   • Atomic counter `UPDATE ... SET seats = seats-1 WHERE seats > 0`: also
 *     correct, but denormalises the seat count and needs careful increment-back
 *     on cancel; we preferred a single source of truth (the bookings table).
 *   • SERIALIZABLE isolation: correct, but pushes the failure to commit-time
 *     40001 retries the client must handle. Row-lock is simpler to reason about
 *     for exactly this "guard one row" case.
 *   • Unique constraint alone: stops ONE rider double-booking (and we keep it as
 *     a second safety net), but can't cap the TOTAL at N seats.
 */
import { prisma } from '../db.js';
import { conflict, notFound } from '../lib/errors.js';
import { writeAudit } from '../lib/audit.js';
import { computeShares } from './cost.service.js';

export async function bookSeat(rideId, riderId) {
  return prisma.$transaction(async (tx) => {
    // 1. Lock the ride row. Everything below runs while we hold this lock.
    const rows = await tx.$queryRaw`
      SELECT id, "seatsTotal", status
      FROM "rides" WHERE id = ${rideId}
      FOR UPDATE
    `;
    const ride = rows[0];
    if (!ride) throw notFound('Ride not found');

    // 2. A completed or cancelled ride takes no bookings (§3.6).
    if (ride.status !== 'OPEN') throw conflict(`Ride is ${ride.status.toLowerCase()}, cannot book`);

    // 3. If this rider already has a booking on this ride, handle it.
    const existing = await tx.booking.findUnique({
      where: { rideId_riderId: { rideId, riderId } },
    });
    if (existing?.status === 'CONFIRMED') throw conflict('You already have a seat on this ride');

    // 4. Count confirmed seats UNDER THE LOCK, and check capacity.
    const confirmed = await tx.booking.count({ where: { rideId, status: 'CONFIRMED' } });
    if (confirmed >= ride.seatsTotal) throw conflict('No seats available'); // the last-seat gate

    // 5. Create (or re-activate) the booking.
    const booking = existing
      ? await tx.booking.update({ where: { id: existing.id }, data: { status: 'CONFIRMED' } })
      : await tx.booking.create({ data: { rideId, riderId, status: 'CONFIRMED' } });

    const shares = computeShares(await rideCost(tx, rideId), confirmed + 1);

    await writeAudit(tx, {
      action: 'BOOKING_CREATED',
      actorId: riderId, rideId, bookingId: booking.id,
      details: { confirmedAfter: confirmed + 1, seatsTotal: ride.seatsTotal, perRiderShare: shares.perRiderShare },
    });

    return { booking, ...shares, seatsAvailable: ride.seatsTotal - (confirmed + 1) };
  });
}

/**
 * Cancel a single booking. Either the rider (their own booking) or the ride's
 * driver may cancel it. The seat returns immediately because availability is
 * derived from the confirmed count — cancelling flips status to CANCELLED and
 * the seat is instantly free again (§3.4). Cost split is recomputed for the
 * remaining riders.
 */
export async function cancelBooking(bookingId, actorId) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { ride: true },
    });
    if (!booking) throw notFound('Booking not found');

    // Authorization: rider who owns it, OR the driver of the ride. Anyone else
    // — even with the exact booking id — is forbidden (§6).
    const isRider = booking.riderId === actorId;
    const isDriver = booking.ride.driverId === actorId;
    if (!isRider && !isDriver) throw notFound('Booking not found'); // 404 not 403: don't confirm the id exists

    if (booking.ride.status !== 'OPEN') throw conflict('Ride is locked; bookings cannot change');
    if (booking.status === 'CANCELLED') return { booking, alreadyCancelled: true };

    const cancelled = await tx.booking.update({ where: { id: bookingId }, data: { status: 'CANCELLED' } });

    const confirmed = await tx.booking.count({ where: { rideId: booking.rideId, status: 'CONFIRMED' } });
    const shares = computeShares(booking.ride.estimatedCost, confirmed);

    await writeAudit(tx, {
      action: 'BOOKING_CANCELLED',
      actorId, rideId: booking.rideId, bookingId,
      details: { cancelledBy: isDriver ? 'DRIVER' : 'RIDER', confirmedAfter: confirmed, perRiderShare: shares.perRiderShare },
    });
    // COST_RECALCULATED is a separate trace so a dispute can see the exact moment
    // shares changed and why.
    await writeAudit(tx, {
      action: 'COST_RECALCULATED',
      actorId, rideId: booking.rideId,
      details: { reason: 'BOOKING_CANCELLED', confirmedCount: confirmed, perRiderShare: shares.perRiderShare },
    });

    return { booking: cancelled, ...shares };
  });
}

async function rideCost(tx, rideId) {
  const r = await tx.ride.findUnique({ where: { id: rideId }, select: { estimatedCost: true } });
  return r.estimatedCost;
}
