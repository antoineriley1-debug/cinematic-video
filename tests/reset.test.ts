import { describe, expect, it } from "vitest";
import { db, makeUser, makeSite, uniq } from "./helpers";
import { wipeAllData, seedProduction, MEDSTAR_HOSPITALS, MEDSTAR_DIRECTORS } from "@/lib/services/reset";

describe("full data reset to MedStar production data", () => {
  it("wipes every table, then seeds 10 hospitals, 10 directors, and the admin", async () => {
    const user = await makeUser();
    const site = await makeSite("Demo Hospital To Be Deleted");
    await db.project.create({ data: { name: uniq("P"), createdById: user.id } });
    await db.note.create({ data: { content: "demo", authorId: user.id } });

    const deleted = await wipeAllData(db);
    expect(deleted).toBeGreaterThan(0);
    expect(await db.user.count()).toBe(0);
    expect(await db.site.count()).toBe(0);
    expect(await db.project.count()).toBe(0);
    expect(await db.note.count()).toBe(0);
    expect(await db.site.findFirst({ where: { id: site.id } })).toBeNull();

    const { admin } = await seedProduction(db, { adminPassword: "test-only" });
    expect(await db.site.count()).toBe(MEDSTAR_HOSPITALS.length);
    expect(await db.director.count()).toBe(MEDSTAR_DIRECTORS.length);
    expect(admin.role).toBe("ADMIN");

    // Every director is attached to the right hospital.
    for (const d of MEDSTAR_DIRECTORS) {
      const row = await db.director.findFirst({ where: { name: d.name }, include: { site: true } });
      expect(row?.site?.code).toBe(d.code);
    }

    // Idempotent: running the seed again duplicates nothing.
    await seedProduction(db, { adminPassword: "test-only" });
    expect(await db.site.count()).toBe(MEDSTAR_HOSPITALS.length);
    expect(await db.director.count()).toBe(MEDSTAR_DIRECTORS.length);
    expect(await db.user.count()).toBe(1);
  });
});
