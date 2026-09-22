/**
 * ride.service.js — posting, viewing (with contact-visibility rules),
 * ride cancellation, and completion locking.
 */
import { prisma } from '../db.js';
import { forbidden, notFound, conflict } from '../lib/errors.js';
import { writeAudit } from '../lib/audit.js';
import { computeShares } from './cost.service.js';

export async function postRide(driverId, data) {
  const ride = await prisma.$transaction(async (tx) => {
    const created = await tx.ride.create({ data: { ...data, driverId } });
    await writeAudit(tx, {
      action: 'RIDE_POSTED', actorId: driverId, rideId: created.id,
      details: { seatsTotal: created.seatsTotal, estimatedCost: Number(created.estimatedCost) },
    });
    return created;
  });
  return ride;
}

/**
 * View one ride, applying the contact-visibility rule (§3.7):
 *   • The DRIVER sees the phone of every CONFIRMED rider.
 *   • A CONFIRMED rider sees the driver's phone.
 *   • Everyone else (search, pending/cancelled) sees NO phone numbers.
 * Visibility is decided when we SHAPE the response — the query only fetches
 * contact fields we might be allowed to show, and we redact based on the viewer.
 */
export async function getRideForViewer(rideId, viewerId) {
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    include: {
      driver: { select: { id: true, name: true, phone: true } },
      bookings: {
        where: { status: 'CONFIRMED' },
        include: { rider: { select: { id: true, name: true, phone: true } } },
      },
    },
  });
  if (!ride) throw notFound('Ride not found');

  const isDriver = ride.driverId === viewerId;
  const viewerConfirmed = ride.bookings.some((b) => b.riderId === viewerId);
  const confirmedCount = ride.bookings.length;
  const shares = computeShares(ride.estimatedCost, confirmedCount);

  return {
    id: ride.id,
    originLabel: ride.originLabel,
    destLabel: ride.destLabel,
    departureTime: ride.departureTime,
    seatsTotal: ride.seatsTotal,
    seatsAvailable: ride.seatsTotal - confirmedCount,
    status: ride.status,
    estimatedCost: Number(ride.estimatedCost),
    perRiderShare: shares.perRiderShare,
    driver: {
      id: ride.driver.id,
      name: ride.driver.name,
      // Driver phone shown ONLY to a confirmed rider (or the driver themselves).
      phone: (isDriver || viewerConfirmed) ? ride.driver.phone : null,
    },
    // Rider roster (with phones) is visible ONLY to the driver.
    riders: isDriver
      ? ride.bookings.map((b) => ({ id: b.rider.id, name: b.rider.name, phone: b.rider.phone }))
      : undefined,
  };
}

/**
 * Driver cancels the WHOLE ride: mark it CANCELLED and cancel every active
 * booking (§3.4). What a rider sees afterwards: their booking is CANCELLED and
 * the ride status is CANCELLED — documented in the README under "cancellation".
 */
export async function cancelRide(rideId, driverId) {
  return prisma.$transaction(async (tx) => {
    const ride = await tx.ride.findUnique({ where: { id: rideId } });
    if (!ride) throw notFound('Ride not found');
    if (ride.driverId !== driverId) throw forbidden('Only the ride owner can cancel it');
    if (ride.status !== 'OPEN') throw conflict(`Ride is already ${ride.status.toLowerCase()}`);

    const affected = await tx.booking.updateMany({
      where: { rideId, status: 'CONFIRMED' },
      data: { status: 'CANCELLED' },
    });
    await tx.ride.update({ where: { id: rideId }, data: { status: 'CANCELLED' } });

    await writeAudit(tx, {
      action: 'RIDE_CANCELLED', actorId: driverId, rideId,
      details: { cancelledBookings: affected.count },
    });
    return { rideId, status: 'CANCELLED', cancelledBookings: affected.count };
  });
}

/**
 * Mark a ride COMPLETED. Once completed it is frozen: no new bookings, no
 * cancellations, no edits (§3.6). Enforced in ONE place — the OPEN-status guard
 * that booking/cancel/edit all pass through — so it can't be bypassed by hitting
 * a different endpoint.
 */
export async function completeRide(rideId, driverId) {
  return prisma.$transaction(async (tx) => {
    const ride = await tx.ride.findUnique({ where: { id: rideId } });
    if (!ride) throw notFound('Ride not found');
    if (ride.driverId !== driverId) throw forbidden('Only the ride owner can complete it');
    if (ride.status !== 'OPEN') throw conflict(`Ride is ${ride.status.toLowerCase()}`);

    await tx.ride.update({ where: { id: rideId }, data: { status: 'COMPLETED' } });
    await writeAudit(tx, { action: 'RIDE_COMPLETED', actorId: driverId, rideId, details: {} });
    return { rideId, status: 'COMPLETED' };
  });
}

/** A driver's own rides, or a rider's own bookings — for the "view own" routes. */
export function listDriverRides(driverId) {
  return prisma.ride.findMany({ where: { driverId }, orderBy: { departureTime: 'asc' } });
}

export function listRiderBookings(riderId) {
  return prisma.booking.findMany({
    where: { riderId },
    include: { ride: { select: { originLabel: true, destLabel: true, departureTime: true, status: true } } },
    orderBy: { createdAt: 'desc' },
  });
}
