/**
 * Registration & login. Passwords are bcrypt-hashed; the hash never leaves the
 * service. Every other route requires the token this issues.
 */
import bcrypt from "bcryptjs";
import { prisma } from "../db.js";
import { conflict, unauthorized } from "../lib/errors.js";
import { signToken } from "../auth/jwt.js";

export async function register({ email, name, phone, password }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw conflict("Email already registered");

  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, name, phone, password: hash },
  });
  return { token: signToken(user), user: publicUser(user) };
}

export async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });
  // Same error whether the email is unknown or the password is wrong — don't
  // leak which emails exist.
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw unauthorized("Invalid email or password");
  }
  return { token: signToken(user), user: publicUser(user) };
}

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name });
