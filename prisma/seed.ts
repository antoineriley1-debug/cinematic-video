// PRODUCTION SEED — the real Crothall @ MedStar portfolio.
// Seeds the admin account and the ten MedStar Health hospitals.
// Directors are NOT invented here: add your real roster via the Directors
// page, or give the list to engineering to seed (never fabricate people).
// Idempotent: safe to run repeatedly, never duplicates.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "antoine.riley.1@gmail.com";
const ADMIN_NAME = process.env.SEED_ADMIN_NAME || "Antoine Riley";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "ChangeMe-Crothall-2026";

// MedStar Health — the ten hospitals.
const MEDSTAR_HOSPITALS: { name: string; code: string; location: string }[] = [
  { name: "MedStar Washington Hospital Center", code: "MWHC", location: "Washington, DC" },
  { name: "MedStar Georgetown University Hospital", code: "MGUH", location: "Washington, DC" },
  { name: "MedStar Franklin Square Medical Center", code: "MFSMC", location: "Baltimore, MD" },
  { name: "MedStar Union Memorial Hospital", code: "MUMH", location: "Baltimore, MD" },
  { name: "MedStar Good Samaritan Hospital", code: "MGSH", location: "Baltimore, MD" },
  { name: "MedStar Harbor Hospital", code: "MHH", location: "Baltimore, MD" },
  { name: "MedStar Montgomery Medical Center", code: "MMMC", location: "Olney, MD" },
  { name: "MedStar Southern Maryland Hospital Center", code: "MSMHC", location: "Clinton, MD" },
  { name: "MedStar St. Mary's Hospital", code: "MSMH", location: "Leonardtown, MD" },
  { name: "MedStar National Rehabilitation Hospital", code: "MNRH", location: "Washington, DC" },
];

async function main() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL.toLowerCase() },
    update: {},
    create: {
      email: ADMIN_EMAIL.toLowerCase(),
      name: ADMIN_NAME,
      title: "Regional Vice President",
      role: "ADMIN",
      passwordHash,
    },
  });

  for (const hospital of MEDSTAR_HOSPITALS) {
    const site = await prisma.site.upsert({
      where: { code: hospital.code },
      update: { name: hospital.name, location: hospital.location },
      create: hospital,
    });
    await prisma.siteAssignment.upsert({
      where: { userId_siteId: { userId: admin.id, siteId: site.id } },
      update: {},
      create: { userId: admin.id, siteId: site.id },
    });
  }

  console.log("Seed complete — 10 MedStar hospitals loaded.");
  console.log(`Admin login: ${ADMIN_EMAIL}`);
  console.log(`Password:    ${ADMIN_PASSWORD}${process.env.SEED_ADMIN_PASSWORD ? "" : "   <-- CHANGE THIS after first login"}`);
  console.log("Add your director roster on the Directors page (or provide the list to seed it).");
}

main().finally(() => prisma.$disconnect());
