# RideMatch — Ride Sharing & Matching POC

Drivers post rides; riders search by **where and when** they're going and book a
seat as a **race-safe** operation. Matching runs **in the database** (PostGIS),
and the seat count **can never oversell**.

**Stack:** Express · PostgreSQL + PostGIS · Prisma · JWT auth · Zod validation · pino logs · Node 20+

---

## Quick start (Docker — the required path)

```bash
cp .env.example .env          # tweak secrets if you like
docker compose up --build     # brings up Postgres+PostGIS and the API
```

That's the whole setup (§6: "comes up with `docker compose up` and no manual
setup beyond a documented `.env`"). The API is on http://localhost:3000. On boot
it creates the tables, applies the PostGIS extension + spatial indexes, then
starts serving.

Seed some demo data (optional) in another terminal:

```bash
docker compose exec api node scripts/seed.js
```

## Quick start (local, no Docker for the app)

```bash
# 1. a Postgres WITH PostGIS — easiest is just the db container:
docker compose up -d db
# 2. install + set up schema
npm install
npm run db:setup        # prisma db push  +  apply-postgis.js
npm run db:seed         # optional demo data
npm run dev             # http://localhost:3000
```

---

## Try it with curl

```bash
# register (returns a JWT)
TOKEN=$(curl -s localhost:3000/auth/register -H 'content-type: application/json' \
  -d '{"email":"me@x.dev","name":"Me","phone":"+91-90000-12345","password":"password123"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

# post a ride (as a driver)
curl -s localhost:3000/rides -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"originLabel":"Ahmedabad ISCON","destLabel":"Gandhinagar","originLat":23.0225,"originLng":72.5714,"destLat":23.2156,"destLng":72.6369,"departureTime":"2030-01-01T09:00:00Z","seatsTotal":3,"estimatedCost":450}'

# search (as a rider going roughly the same way, same time window)
curl -s "localhost:3000/rides/search?originLat=23.03&originLng=72.57&destLat=23.21&destLng=72.64&departAfter=2030-01-01T08:00:00Z&departBefore=2030-01-01T10:00:00Z" \
  -H "authorization: Bearer $TOKEN"

# book a seat
curl -s localhost:3000/bookings -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"rideId":"<ride-id-from-search>"}'
```

---

## API surface

| Method & path | Who | Does |
|---|---|---|
| `POST /auth/register` | anyone | create account, returns JWT |
| `POST /auth/login` | anyone | returns JWT |
| `POST /rides` | authed | post a ride |
| `GET /rides/search` | authed | **the matching query** (proximity + time) |
| `GET /rides/search/explain` | authed | the query plan (for §8) |
| `GET /rides/mine` | authed | your posted rides |
| `GET /rides/:id` | authed | ride detail (contact details redacted per §3.7) |
| `POST /rides/:id/cancel` | driver | cancel the whole ride + its bookings |
| `POST /rides/:id/complete` | driver | freeze the ride (§3.6) |
| `POST /bookings` | authed | book a seat (**race-safe**) |
| `GET /bookings/mine` | authed | your bookings |
| `POST /bookings/:id/cancel` | rider or driver | cancel a booking, seat frees instantly |

Every route except `/auth/*` and `/health` requires `Authorization: Bearer <token>`
— there is no anonymous path (§6).

### Interactive docs & Postman

- **Swagger UI** — browse and try every route at `http://localhost:3000/docs` while
  the API is running. The raw spec is also served at `/openapi.json`.
- **Postman** — import [`postman/RideMatch.postman_collection.json`](postman/RideMatch.postman_collection.json).
  Run "Register (Driver)" and "Register (Rider)" first; their test scripts save
  the JWTs into collection variables (`{{driverToken}}`, `{{riderToken}}`) that
  every other request already uses, along with `{{rideId}}`/`{{bookingId}}`
  captured automatically from the post-ride and book-seat responses.

---

## The three decisions you'll be asked about

### 1. The last-seat guarantee (§3.3) — `src/services/booking.service.js`

Inside one transaction: **lock the ride row** with `SELECT … FOR UPDATE`, **then**
count confirmed bookings under the lock, and only insert if there's room. Two
concurrent requests can't both hold the lock — the second waits for the first to
commit, re-reads the now-higher count, and correctly sees the ride is full.
Availability is **derived** (`seatsTotal − confirmed count`), so no counter can
drift or go negative.

Why not the alternatives? Atomic `UPDATE … seats = seats − 1 WHERE seats > 0`
also works but denormalises the count; `SERIALIZABLE` works but makes clients
retry 40001 errors; a unique constraint alone can't cap the total at N (we keep
it anyway as a second guard against one rider double-booking). See the long
comment at the top of the file.

**Proof:** `tests/booking.concurrency.test.js` fires 12 simultaneous bookings for
1 seat and asserts exactly one wins. (This scaffold's logic was verified in a
real Postgres: 12 concurrent → 1 confirmed. The naive no-lock version oversold
8×.)

### 2. Matching (§3.2) — `src/services/matching.service.js`

A single indexed SQL query. A ride matches when its **origin** is within R metres
of the rider's origin **AND** its **destination** is within R metres of the
rider's destination **AND** the departure time is inside the rider's window
**AND** it's OPEN with a free seat. Proximity uses `ST_DWithin(geography,
geography, metres)` over **generated, GiST-indexed** `origin_geog` / `dest_geog`
columns. Requiring **both** endpoints is what encodes "roughly the same
direction". Nothing is loaded into JS and filtered — the DB returns only matches.

**Representation choice & its cost:** coordinates stored as lat/lng, spatial
lookup via geography + GiST. As open rides grow, `ST_DWithin` uses the spatial
index to prune to a small candidate set rather than scanning every ride. Show it
with `GET /rides/search/explain` (see §8 below).

### 3. Contact visibility (§3.7) — `src/services/ride.service.js`

Redacted when we **shape the response**: the driver's phone is returned only to a
**confirmed** rider (or the driver); the rider roster with phones is returned only
to the driver. Search never selects contact fields at all. So a phone number is
impossible to see during search, or for a pending/cancelled booking.

**Completed rides are frozen (§3.6)** in one place: the `status === 'OPEN'` guard
that booking, cancellation and completion all pass through — you can't bypass it
by hitting a different endpoint.

---

## Cancellation semantics (documented per §3.4)

- **Rider cancels their booking:** status → `CANCELLED`; the seat is free
  immediately (availability is derived), and the cost split for remaining riders
  is recomputed.
- **Driver cancels the whole ride:** ride → `CANCELLED` and every confirmed
  booking → `CANCELLED`. **What a rider sees:** their booking now shows
  `CANCELLED` and the ride shows `CANCELLED` (visible via `GET /bookings/mine`).

## Cost split (§3.5)

`share = estimatedCost / (confirmed riders)`, computed live, never stored — so it
is always correct and updates automatically on every booking or cancellation. A
`COST_RECALCULATED` audit row records each change for dispute evidence.

## Audit trail (§6)

Every post / booking / cancellation / recalculation writes a structured
`audit_logs` row **inside the same transaction** as the action, so the log can
never disagree with what actually happened.

---

## Testing

```bash
# point Prisma at a TEST database (never your dev data — tests TRUNCATE tables)
export DATABASE_URL=postgresql://ride:ridepass@localhost:5432/ridematch_test
npm run db:setup
npm test
```

- `tests/booking.concurrency.test.js` — the last-seat race (the sharpest test).
- `tests/authz.test.js` — ownership rules, completed-ride freeze, contact
  visibility — all proven in code, not via the UI (§6).

---

## If you finish early (§8)

```bash
# load 10,000 open rides, then inspect the query plan
BULK=10000 npm run db:seed
curl "localhost:3000/rides/search/explain?originLat=23.03&originLng=72.57&destLat=23.21&destLng=72.64&departAfter=2030-01-01T00:00:00Z&departBefore=2030-01-08T00:00:00Z" \
  -H "authorization: Bearer $TOKEN"
```

Look for `Index Scan using rides_origin_geog_gix` (GiST used) rather than a
`Seq Scan`. If the planner isn't using it, that's the conversation to have.

---

## Project layout

```
src/
  server.js            start + graceful shutdown
  app.js               express wiring
  env.js               validated config
  db.js                shared Prisma client
  auth/                jwt + requireAuth middleware
  routes/              auth, rides, bookings (thin — validate + call service)
  services/            booking (race-safe), matching (PostGIS), ride, cost, auth
  lib/                 errors, validation (zod), audit, logger
prisma/schema.prisma   data model
scripts/               apply-postgis.js, seed.js
tests/                 concurrency + authz
```
