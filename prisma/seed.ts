// PRODUCTION SEED — the real Crothall @ MedStar portfolio.
// Seeds the admin account, the ten MedStar Health hospitals, and the
// facilities director at each site (roster sourced from the portfolio's
// existing contact directory — aqualog lib/hospitals.js / work-universe).
// Idempotent: safe to run repeatedly, never duplicates.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "antoine.riley.1@gmail.com";
const ADMIN_NAME = process.env.SEED_ADMIN_NAME || "Antoine W. Riley Sr.";
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

// Facilities director at each hospital. Emails intentionally omitted where
// not confirmed — add them in the app rather than guessing addresses.
const DIRECTORS: { code: string; name: string; phone?: string; email?: string }[] = [
  { code: "MWHC", name: "Ryan Ollie", phone: "847-421-7584" },
  { code: "MGUH", name: "Ryan Boughner", phone: "240-274-0808" },
  { code: "MFSMC", name: "Ryan Stoots", phone: "443-653-2018" },
  { code: "MUMH", name: "Sam Mirmirani", phone: "703-431-4115" },
  { code: "MGSH", name: "James Yap", phone: "443-703-8972" },
  { code: "MHH", name: "Bob Decker", phone: "443-699-3142" },
  { code: "MMMC", name: "Bob Dickey", phone: "202-731-0975" },
  { code: "MSMHC", name: "Brandon Myers", phone: "240-346-4038" },
  { code: "MSMH", name: "Ramon Solomon", phone: "301-475-6013", email: "ramon.salomon@medstar.net" },
  { code: "MNRH", name: "George Saoutis", phone: "202-345-4531" },
];

async function main() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL.toLowerCase() },
    update: {},
    create: {
      email: ADMIN_EMAIL.toLowerCase(),
      name: ADMIN_NAME,
      title: "Director of Systems Maintenance",
      role: "ADMIN",
      passwordHash,
    },
  });

  const siteByCode = new Map<string, string>();
  for (const hospital of MEDSTAR_HOSPITALS) {
    const site = await prisma.site.upsert({
      where: { code: hospital.code },
      update: { name: hospital.name, location: hospital.location },
      create: hospital,
    });
    siteByCode.set(hospital.code, site.id);
    await prisma.siteAssignment.upsert({
      where: { userId_siteId: { userId: admin.id, siteId: site.id } },
      update: {},
      create: { userId: admin.id, siteId: site.id },
    });
  }

  for (const d of DIRECTORS) {
    const siteId = siteByCode.get(d.code)!;
    const data = { name: d.name, title: "Facilities Director", siteId, phone: d.phone ?? null, email: d.email ?? null };
    const existing = await prisma.director.findFirst({ where: { name: d.name } });
    if (existing) await prisma.director.update({ where: { id: existing.id }, data });
    else await prisma.director.create({ data });
  }

  console.log("Seed complete — 10 MedStar hospitals + facilities directors loaded.");
  console.log(`Admin login: ${ADMIN_EMAIL}`);
  console.log(`Password:    ${ADMIN_PASSWORD}${process.env.SEED_ADMIN_PASSWORD ? "" : "   <-- CHANGE THIS after first login"}`);
  console.log("Directors: Ollie, Boughner, Stoots, Mirmirani, Yap, Decker, Dickey, Myers, Solomon, Saoutis — one per hospital.");
}

main().finally(() => prisma.$disconnect());
