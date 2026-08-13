// PRODUCTION SEED — the real Crothall @ MedStar portfolio (admin account,
// ten hospitals, facilities directors). Data + logic live in
// src/lib/services/reset.ts so the in-app admin reset seeds identically.
// Idempotent: safe to run repeatedly, never duplicates.
import { PrismaClient } from "@prisma/client";
import { seedProduction } from "../src/lib/services/reset";

const prisma = new PrismaClient();

async function main() {
  const { adminEmail } = await seedProduction(prisma);
  console.log("Seed complete — 10 MedStar hospitals + facilities directors loaded.");
  console.log(`Admin login: ${adminEmail}`);
  console.log(`Password:    ${process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe-Crothall-2026   <-- CHANGE THIS after first login"}`);
  console.log("Directors: Ollie, Boughner, Stoots, Mirmirani, Yap, Decker, Dickey, Myers, Solomon, Saoutis — one per hospital.");
}

main().finally(() => prisma.$disconnect());
