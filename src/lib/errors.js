/**
 * A tiny typed-error toolkit so the whole app speaks one error language, and a
 * single Express error handler can turn any of them into the right HTTP status.
 *
 * The rule the spec cares about: bad input and authz failures are REJECTED with
 * a clear status BEFORE they reach business logic — never a 500.
 */

export class AppError extends Error {
  /** @param {number} status @param {string} code @param {string} message @param {any} [details] */
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest   = (msg, details) => new AppError(400, 'BAD_REQUEST', msg, details);
export const unauthorized = (msg = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', msg);
export const forbidden    = (msg = 'You do not have access to this resource') => new AppError(403, 'FORBIDDEN', msg);
export const notFound     = (msg = 'Not found') => new AppError(404, 'NOT_FOUND', msg);
export const conflict     = (msg, details) => new AppError(409, 'CONFLICT', msg, details);

/** Express error-handling middleware (must have 4 args). */
export function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  // Zod validation errors are turned into AppErrors upstream; anything reaching
  // here unexpectedly is a real bug — log it and return a safe 500.
  req.log?.error({ err }, 'unhandled error');
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
}

/** Wrap an async route handler so thrown/rejected errors reach errorHandler. */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
