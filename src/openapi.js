/**
 * OpenAPI spec, served at /docs (swagger-ui-express) and /openapi.json.
 * Kept as a plain JS object next to the routes it describes — no build step,
 * no separate yaml file to fall out of sync.
 */

const bearerAuth = { bearerAuth: [] };

const errorSchema = {
  type: 'object',
  properties: {
    error: {
      type: 'object',
      properties: {
        code: { type: 'string', example: 'BAD_REQUEST' },
        message: { type: 'string' },
        details: { type: 'object', nullable: true },
      },
    },
  },
};

export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'RideMatch API',
    version: '1.0.0',
    description:
      'Ride sharing & matching POC. Drivers post rides; riders search by proximity + time window ' +
      'and book a race-safe seat. All routes except /auth/* and /health require a Bearer token.',
  },
  servers: [{ url: 'http://localhost:3000', description: 'Local / docker compose' }],
  tags: [
    { name: 'Auth', description: 'Register and log in' },
    { name: 'Rides', description: 'Post, search, view, cancel, complete rides' },
    { name: 'Bookings', description: 'Book and cancel seats' },
    { name: 'Health', description: 'Liveness check' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Error: errorSchema,
      AuthResponse: {
        type: 'object',
        properties: {
          token: { type: 'string' },
          user: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              email: { type: 'string' },
              name: { type: 'string' },
            },
          },
        },
      },
      Ride: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          driverId: { type: 'string' },
          originLabel: { type: 'string' },
          destLabel: { type: 'string' },
          originLat: { type: 'number' },
          originLng: { type: 'number' },
          destLat: { type: 'number' },
          destLng: { type: 'number' },
          departureTime: { type: 'string', format: 'date-time' },
          seatsTotal: { type: 'integer' },
          estimatedCost: { type: 'number' },
          status: { type: 'string', enum: ['OPEN', 'COMPLETED', 'CANCELLED'] },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      RideSearchResult: {
        type: 'object',
        properties: {
          count: { type: 'integer' },
          rides: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                originLabel: { type: 'string' },
                destLabel: { type: 'string' },
                departureTime: { type: 'string', format: 'date-time' },
                seatsTotal: { type: 'integer' },
                estimatedCost: { type: 'number' },
                driverId: { type: 'string' },
                seatsAvailable: { type: 'integer' },
                originDistanceM: { type: 'integer' },
                destDistanceM: { type: 'integer' },
              },
            },
          },
        },
      },
      RideDetail: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          originLabel: { type: 'string' },
          destLabel: { type: 'string' },
          departureTime: { type: 'string', format: 'date-time' },
          seatsTotal: { type: 'integer' },
          seatsAvailable: { type: 'integer' },
          status: { type: 'string', enum: ['OPEN', 'COMPLETED', 'CANCELLED'] },
          estimatedCost: { type: 'number' },
          perRiderShare: { type: 'number' },
          driver: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              phone: {
                type: 'string',
                nullable: true,
                description: 'Only present for the driver themselves or a rider with a CONFIRMED booking (§3.7).',
              },
            },
          },
          riders: {
            type: 'array',
            nullable: true,
            description: 'Only present when the viewer is the driver.',
            items: {
              type: 'object',
              properties: { id: { type: 'string' }, name: { type: 'string' }, phone: { type: 'string' } },
            },
          },
        },
      },
      Booking: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          rideId: { type: 'string' },
          riderId: { type: 'string' },
          status: { type: 'string', enum: ['CONFIRMED', 'CANCELLED'] },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      BookingResult: {
        type: 'object',
        properties: {
          booking: { $ref: '#/components/schemas/Booking' },
          confirmedCount: { type: 'integer' },
          perRiderShare: { type: 'number' },
          totalCost: { type: 'number' },
          seatsAvailable: { type: 'integer' },
        },
      },
    },
    responses: {
      BadRequest: { description: 'Validation failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      Unauthorized: { description: 'Missing or invalid Bearer token', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      Forbidden: { description: 'Not the owner of this resource', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      NotFound: { description: 'Resource not found (or not yours)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      Conflict: { description: 'e.g. no seats available, ride locked', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    },
  },
  security: [bearerAuth],
  paths: {
    '/health': {
      get: {
        tags: ['Health'], summary: 'Liveness check', security: [],
        responses: { 200: { description: 'ok', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string' } } } } } } },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Auth'], summary: 'Register a new user', security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'name', 'phone', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  name: { type: 'string' },
                  phone: { type: 'string' },
                  password: { type: 'string', minLength: 8 },
                },
              },
              example: { email: 'driver@x.dev', name: 'Driver One', phone: '+91-90000-11111', password: 'password123' },
            },
          },
        },
        responses: {
          201: { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          400: { $ref: '#/components/responses/BadRequest' },
          409: { $ref: '#/components/responses/Conflict' },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'], summary: 'Log in', security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' } } },
              example: { email: 'driver@x.dev', password: 'password123' },
            },
          },
        },
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/rides': {
      post: {
        tags: ['Rides'], summary: 'Post a ride (driver)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['originLabel', 'destLabel', 'originLat', 'originLng', 'destLat', 'destLng', 'departureTime', 'seatsTotal', 'estimatedCost'],
                properties: {
                  originLabel: { type: 'string' },
                  destLabel: { type: 'string' },
                  originLat: { type: 'number' },
                  originLng: { type: 'number' },
                  destLat: { type: 'number' },
                  destLng: { type: 'number' },
                  departureTime: { type: 'string', format: 'date-time', description: 'Must be in the future' },
                  seatsTotal: { type: 'integer', minimum: 1 },
                  estimatedCost: { type: 'number', minimum: 0 },
                },
              },
              example: {
                originLabel: 'Ahmedabad ISCON', destLabel: 'Gandhinagar',
                originLat: 23.0225, originLng: 72.5714, destLat: 23.2156, destLng: 72.6369,
                departureTime: '2030-01-01T09:00:00Z', seatsTotal: 3, estimatedCost: 450,
              },
            },
          },
        },
        responses: {
          201: { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Ride' } } } },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/rides/search': {
      get: {
        tags: ['Rides'], summary: 'Search / match rides by proximity + time window',
        parameters: [
          { name: 'originLat', in: 'query', required: true, schema: { type: 'number' } },
          { name: 'originLng', in: 'query', required: true, schema: { type: 'number' } },
          { name: 'destLat', in: 'query', required: true, schema: { type: 'number' } },
          { name: 'destLng', in: 'query', required: true, schema: { type: 'number' } },
          { name: 'departAfter', in: 'query', required: true, schema: { type: 'string', format: 'date-time' } },
          { name: 'departBefore', in: 'query', required: true, schema: { type: 'string', format: 'date-time' } },
          { name: 'radiusMeters', in: 'query', required: false, schema: { type: 'number' }, description: 'Default: MATCH_RADIUS_METERS (5000)' },
        ],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/RideSearchResult' } } } },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/rides/search/explain': {
      get: {
        tags: ['Rides'], summary: 'EXPLAIN ANALYZE the matching query (for the §8 load test)',
        parameters: [
          { name: 'originLat', in: 'query', required: true, schema: { type: 'number' } },
          { name: 'originLng', in: 'query', required: true, schema: { type: 'number' } },
          { name: 'destLat', in: 'query', required: true, schema: { type: 'number' } },
          { name: 'destLng', in: 'query', required: true, schema: { type: 'number' } },
          { name: 'departAfter', in: 'query', required: true, schema: { type: 'string', format: 'date-time' } },
          { name: 'departBefore', in: 'query', required: true, schema: { type: 'string', format: 'date-time' } },
          { name: 'radiusMeters', in: 'query', required: false, schema: { type: 'number' } },
        ],
        responses: { 200: { description: 'Raw EXPLAIN rows' }, 400: { $ref: '#/components/responses/BadRequest' }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
    },
    '/rides/mine': {
      get: {
        tags: ['Rides'], summary: "The caller's own posted rides",
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Ride' } } } } },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/rides/{id}': {
      get: {
        tags: ['Rides'], summary: 'View one ride (contact details redacted per §3.7 unless viewer qualifies)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/RideDetail' } } } },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/rides/{id}/cancel': {
      post: {
        tags: ['Rides'], summary: 'Cancel the whole ride and all its confirmed bookings (driver only)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { rideId: { type: 'string' }, status: { type: 'string' }, cancelledBookings: { type: 'integer' } } } } } },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
          409: { $ref: '#/components/responses/Conflict' },
        },
      },
    },
    '/rides/{id}/complete': {
      post: {
        tags: ['Rides'], summary: 'Mark a ride completed — freezes it (§3.6), driver only',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { rideId: { type: 'string' }, status: { type: 'string' } } } } } },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
          409: { $ref: '#/components/responses/Conflict' },
        },
      },
    },
    '/bookings': {
      post: {
        tags: ['Bookings'], summary: 'Book a seat on a ride (race-safe, §3.3)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['rideId'], properties: { rideId: { type: 'string' } } }, example: { rideId: 'cmu3ql6lb0004wb3sm3jigcxo' } } },
        },
        responses: {
          201: { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/BookingResult' } } } },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          409: { description: 'No seats available, ride locked, or already booked', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/bookings/mine': {
      get: {
        tags: ['Bookings'], summary: "The caller's own bookings",
        responses: { 200: { description: 'OK' }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
    },
    '/bookings/{id}/cancel': {
      post: {
        tags: ['Bookings'], summary: 'Cancel a booking (the rider who owns it, or the ride driver)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/BookingResult' } } } },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          409: { $ref: '#/components/responses/Conflict' },
        },
      },
    },
  },
};
