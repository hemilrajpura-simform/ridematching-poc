/**
 * Seed demo data so you can search immediately, plus an optional bulk load for
 * the §8 "10,000 open rides" experiment:  BULK=10000 npm run db:seed
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../src/db.js';

const pw = await bcrypt.hash('password123', 8);

async function main() {
  const driver = await prisma.user.upsert({
    where: { email: 'driver@demo.dev' },
    update: {},
    create: { email: 'driver@demo.dev', name: 'Dev Driver', phone: '+91-90000-00001', password: pw },
  });
  const rider = await prisma.user.upsert({
    where: { email: 'rider@demo.dev' },
    update: {},
    create: { email: 'rider@demo.dev', name: 'Dev Rider', phone: '+91-90000-00002', password: pw },
  });

  const soon = new Date(Date.now() + 2 * 3600_000);

  // A ride that SHOULD match a rider going Ahmedabad -> Gandhinagar soon.
  await prisma.ride.create({ data: {
    driverId: driver.id, originLabel: 'Ahmedabad ISCON', destLabel: 'Gandhinagar Sachivalaya',
    originLat: 23.0225, originLng: 72.5714, destLat: 23.2156, destLng: 72.6369,
    departureTime: soon, seatsTotal: 3, estimatedCost: 450,
  }});

  // A ride at the same TIME but wrong DIRECTION (should NOT match).
  await prisma.ride.create({ data: {
    driverId: driver.id, originLabel: 'Ahmedabad', destLabel: 'Vadodara (opposite way)',
    originLat: 23.0225, originLng: 72.5714, destLat: 22.3072, destLng: 73.1812,
    departureTime: soon, seatsTotal: 3, estimatedCost: 800,
  }});

  const bulk = Number(process.env.BULK ?? 0);
  if (bulk > 0) {
    console.log(`Inserting ${bulk} random open rides for load testing...`);
    const rows = Array.from({ length: bulk }, () => {
      // Scatter around Gujarat.
      const oLat = 22 + Math.random() * 2, oLng = 72 + Math.random() * 2;
      const dLat = 22 + Math.random() * 2, dLng = 72 + Math.random() * 2;
      return {
        driverId: driver.id, originLabel: 'bulk', destLabel: 'bulk',
        originLat: oLat, originLng: oLng, destLat: dLat, destLng: dLng,
        departureTime: new Date(Date.now() + Math.random() * 7 * 86400_000),
        seatsTotal: 4, estimatedCost: 500,
      };
    });
    // createMany is fast; geog columns fill in automatically (generated).
    for (let i = 0; i < rows.length; i += 1000) {
      await prisma.ride.createMany({ data: rows.slice(i, i + 1000) });
    }
    console.log('bulk insert done.');
  }

  console.log('Seed complete. Login as rider@demo.dev / password123');
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
