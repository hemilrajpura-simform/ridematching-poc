/**
 * JWT issue/verify. Small and boring on purpose.
 */
import jwt from 'jsonwebtoken';
import { env } from '../env.js';

export function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

export function verifyToken(token) {
  return jwt.verify(token, env.JWT_SECRET); // throws on invalid/expired
}
