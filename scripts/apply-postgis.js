/**
 * apply-postgis.js — the one thing Prisma can't do for us.
 *
 * Run AFTER `prisma db push` has created the tables. This:
 *   1. enables the PostGIS extension,
 *   2. adds two GENERATED geography columns to `rides` (kept in sync from the
 *      lat/lng columns automatically, so normal Prisma writes just work),
 *   3. builds a GiST spatial index on each — this is what makes proximity
 *      matching an indexed lookup instead of a full table scan.
 *
 * It is idempotent: safe to run repeatedly (used by db:setup and the Docker
 * entrypoint). Column names are quoted because Prisma creates them camelCased.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const statements = [
  `CREATE EXTENSION IF NOT EXISTS postgis;`,

  // origin geography, generated from originLng/originLat. SRID 4326 = WGS84 (GPS).
  `ALTER TABLE "rides"
     ADD COLUMN IF NOT EXISTS origin_geog geography(Point, 4326)
     GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("originLng", "originLat"), 4326)::geography) STORED;`,

  `ALTER TABLE "rides"
     ADD COLUMN IF NOT EXISTS dest_geog geography(Point, 4326)
     GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("destLng", "destLat"), 4326)::geography) STORED;`,

  // GiST indexes — the payoff. ST_DWithin can use these for a bounded search.
  `CREATE INDEX IF NOT EXISTS rides_origin_geog_gix ON "rides" USING GIST (origin_geog);`,
  `CREATE INDEX IF NOT EXISTS rides_dest_geog_gix   ON "rides" USING GIST (dest_geog);`,

  // A composite btree that helps the non-spatial half of the matching WHERE.
  `CREATE INDEX IF NOT EXISTS rides_status_departure_idx ON "rides" ("status", "departureTime");`,
];

try {
  for (const sql of statements) {
    await prisma.$executeRawUnsafe(sql);
    console.log('✓', sql.split('\n')[0].slice(0, 70).trim());
  }
  console.log('\nPostGIS setup complete.');
} catch (err) {
  console.error('PostGIS setup failed:', err.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
