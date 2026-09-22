/**
 * requireAuth — the gate that makes sure "there is no anonymous path through
 * this system" (§6). Every protected route mounts this; it puts the
 * authenticated user id on req.userId for the handlers and services to use.
 *
 * Authorization (can THIS user touch THIS record) is enforced deeper, in the
 * services, by checking ownership against req.userId — not here. Authn here,
 * authz there.
 */
import { verifyToken } from './jwt.js';
import { unauthorized } from '../lib/errors.js';

export function requireAuth(req, _res, next) {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(unauthorized('Missing Bearer token'));
  }
  try {
    const payload = verifyToken(token);
    req.userId = payload.sub;
    next();
  } catch {
    next(unauthorized('Invalid or expired token'));
  }
}
