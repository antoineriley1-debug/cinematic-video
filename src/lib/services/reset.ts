// Full data reset + production (MedStar) seed. Used by the admin console's
// Danger Zone and by `npm run db:seed` / scripts/reset-data.mjs, so the
// hospital and director rosters live in exactly one place.
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import type { Db } from "../db";

export const MEDSTAR_HOSPITALS: { name: string; code: string; location: string }[] = [
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
export const MEDSTAR_DIRECTORS: { code: string; name: string; phone?: string; email?: string }[] = [
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

/**
 * Delete every row of every table (schema untouched). Returns rows deleted.
 * The model list comes from Prisma's own metadata, so new tables can never be
 * missed; multi-pass deletion handles foreign-key ordering (a delete blocked
 * by a child table succeeds on a later pass once the children are gone).
 */
export async function wipeAllData(db: Db): Promise<number> {
  const models = Prisma.dmmf.datamodel.models.map((m) => m.name[0].toLowerCase() + m.name.slice(1));
  const delegates = db as unknown as Record<string, { deleteMany: (a: object) => Promise<{ count: number }> }>;
  let total = 0;
  let remaining = [...models];
  for (let pass = 0; pass < models.length && remaining.length > 0; pass++) {
    const blocked: string[] = [];
    for (const model of remaining) {
      try {
        total += (await delegates[model].deleteMany({})).count;
      } catch {
        blocked.push(model); // FK constraint — children not yet cleared
      }
    }
    if (blocked.length === remaining.length)
      throw new Error(`Data reset could not clear tables: ${blocked.join(", ")}`);
    remaining = blocked;
  }
  return total;
}

export type SeedOptions = { adminEmail?: string; adminName?: string; adminPassword?: string };

/** Idempotent production seed: admin account + 10 MedStar hospitals + directors. */
export async function seedProduction(db: Db, opts: SeedOptions = {}) {
  const adminEmail = (opts.adminEmail || process.env.SEED_ADMIN_EMAIL || "antoine.riley.1@gmail.com").toLowerCase();
  const adminName = opts.adminName || process.env.SEED_ADMIN_NAME || "Antoine W. Riley Sr.";
  const adminPassword = opts.adminPassword || process.env.SEED_ADMIN_PASSWORD || "ChangeMe-Crothall-2026";

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const admin = await db.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: { email: adminEmail, name: adminName, title: "Director of Systems Maintenance", role: "ADMIN", passwordHash },
  });

  const siteByCode = new Map<string, string>();
  for (const hospital of MEDSTAR_HOSPITALS) {
    const site = await db.site.upsert({
      where: { code: hospital.code },
      update: { name: hospital.name, location: hospital.location },
      create: hospital,
    });
    siteByCode.set(hospital.code, site.id);
    await db.siteAssignment.upsert({
      where: { userId_siteId: { userId: admin.id, siteId: site.id } },
      update: {},
      create: { userId: admin.id, siteId: site.id },
    });
  }

  for (const d of MEDSTAR_DIRECTORS) {
    const siteId = siteByCode.get(d.code)!;
    const data = { name: d.name, title: "Facilities Director", siteId, phone: d.phone ?? null, email: d.email ?? null };
    const existing = await db.director.findFirst({ where: { name: d.name } });
    if (existing) await db.director.update({ where: { id: existing.id }, data });
    else await db.director.create({ data });
  }

  return { admin, adminEmail };
}
