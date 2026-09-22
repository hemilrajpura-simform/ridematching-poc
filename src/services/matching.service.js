/**
 * matching.service.js — THE core query of this POC.
 *
 * Walkthrough Q1: "Show me the matching query. How does it filter by proximity
 * of BOTH origin and destination?"
 *
 * Answer, in one breath: it's a single indexed SQL query. A ride matches when
 *   (a) its origin is within R metres of the rider's origin   AND
 *   (b) its destination is within R metres of the rider's dest AND
 *   (c) its departure time falls inside the rider's window     AND
 *   (d) it is still OPEN and has at least one free seat.
 *
 * Proximity is ST_DWithin(geography, geography, metres) on the GENERATED,
 * GiST-indexed origin_geog / dest_geog columns — so the planner can use a
 * spatial index instead of scanning every open ride. Requiring BOTH origin AND
 * dest to be within R is what encodes "roughly the same direction": a ride that
 * matches only the origin, or only the time, is excluded by the AND.
 *
 * This is a REAL database query, not a client-side filter over "all rides".
 * Nothing is loaded into JS and filtered — the database does the work and
 * returns only matches.
 */
import { prisma } from '../db.js';
import { env } from '../env.js';

/**
 * @param {object} q validated search params (see searchSchema)
 * @returns rides that match, each with live free-seat count, NO contact details
 */
export async function findMatchingRides(q) {
  const radius = q.radiusMeters ?? env.MATCH_RADIUS_METERS;

  // ST_MakePoint takes (longitude, latitude). ::geography makes ST_DWithin use
  // metres on the sphere. $queryRaw is parameterised ($1..$n) — no SQL injection.
  //
  // Note the outer wrapper: the ST_DWithin filters must sit on the base table in
  // the INNER query so the GiST indexes can be used. The distance columns are
  // SELECT aliases, and Postgres won't let you reference an alias inside an
  // expression in ORDER BY — so we sort in the OUTER query, where they're real
  // columns. (Verified against Postgres — the inline-alias form errors out.)
  const rides = await prisma.$queryRaw`
    SELECT m.* FROM (
      SELECT
        r.id,
        r."originLabel",
        r."destLabel",
        r."departureTime",
        r."seatsTotal",
        r."estimatedCost",
        r."driverId",
        -- live free-seat count, computed in the DB
        (r."seatsTotal" - COALESCE(b.confirmed, 0))::int AS "seatsAvailable",
        -- distances are handy for sorting best matches first
        ST_Distance(r.origin_geog, ST_SetSRID(ST_MakePoint(${q.originLng}, ${q.originLat}), 4326)::geography) AS origin_dist_m,
        ST_Distance(r.dest_geog,   ST_SetSRID(ST_MakePoint(${q.destLng},   ${q.destLat}),   4326)::geography) AS dest_dist_m
      FROM "rides" r
      LEFT JOIN (
        SELECT "rideId", count(*) AS confirmed
        FROM "bookings" WHERE status = 'CONFIRMED'
        GROUP BY "rideId"
      ) b ON b."rideId" = r.id
      WHERE r.status = 'OPEN'
        -- (a) origin within radius  (uses rides_origin_geog_gix)
        AND ST_DWithin(r.origin_geog, ST_SetSRID(ST_MakePoint(${q.originLng}, ${q.originLat}), 4326)::geography, ${radius})
        -- (b) destination within radius  (uses rides_dest_geog_gix)
        AND ST_DWithin(r.dest_geog,   ST_SetSRID(ST_MakePoint(${q.destLng},   ${q.destLat}),   4326)::geography, ${radius})
        -- (c) departure inside the rider's window
        AND r."departureTime" BETWEEN ${q.departAfter} AND ${q.departBefore}
        -- (d) at least one free seat
        AND (r."seatsTotal" - COALESCE(b.confirmed, 0)) > 0
    ) m
    ORDER BY (m.origin_dist_m + m.dest_dist_m) ASC
    LIMIT 50;
  `;

  // Contact details are deliberately NOT selected above — search must never
  // leak a phone number (§3.7). They appear only after a confirmed booking.
  return rides.map((r) => ({
    ...r,
    estimatedCost: Number(r.estimatedCost),
    originDistanceM: Math.round(Number(r.origin_dist_m)),
    destDistanceM: Math.round(Number(r.dest_dist_m)),
    origin_dist_m: undefined,
    dest_dist_m: undefined,
  }));
}

/**
 * The query plan, for the walkthrough / the "finish early" load test. Run this
 * to show whether the GiST indexes are being used at scale.
 */
export async function explainMatching(q) {
  const radius = q.radiusMeters ?? env.MATCH_RADIUS_METERS;
  return prisma.$queryRawUnsafe(
    `EXPLAIN (ANALYZE, BUFFERS)
     SELECT r.id FROM "rides" r
     WHERE r.status = 'OPEN'
       AND ST_DWithin(r.origin_geog, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $5)
       AND ST_DWithin(r.dest_geog,   ST_SetSRID(ST_MakePoint($3,$4),4326)::geography, $5)
       AND r."departureTime" BETWEEN $6 AND $7`,
    q.originLng, q.originLat, q.destLng, q.destLat, radius, q.departAfter, q.departBefore,
  );
}
