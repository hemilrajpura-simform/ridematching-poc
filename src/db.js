/**
 * A single shared PrismaClient for the whole app. Import this everywhere —
 * never `new PrismaClient()` per request (that leaks connections).
 */
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

// Close the pool cleanly on shutdown (see server.js graceful shutdown).
export async function disconnectDb() {
  await prisma.$disconnect();
}
