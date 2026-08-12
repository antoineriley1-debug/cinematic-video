import { describe, it, expect } from "vitest";
import { db, makeUser, makeSite, makeDirector } from "./helpers";
import { addToDirectorFile, recordInfraction, checkInfractionThreshold, maybeDetectDirectorPattern } from "@/lib/services/directors";
import { setSetting } from "@/lib/settings";

describe("director file", () => {
  it("adds classified entries with audit and activity", async () => {
    const user = await makeUser();
    const director = await makeDirector();
    const entry = await addToDirectorFile(db, {
      directorId: director.id,
      classification: "RECOGNITION",
      content: "Outstanding survey readiness work.",
      createdById: user.id,
    });
    expect(entry.classification).toBe("RECOGNITION");
    expect(await db.auditLog.count({ where: { entityType: "DIRECTOR_FILE_ENTRY", entityId: entry.id } })).toBe(1);
  });

  it("refuses AI-recommended infractions without explicit human confirmation", async () => {
    const user = await makeUser();
    const director = await makeDirector();
    await expect(
      addToDirectorFile(db, {
        directorId: director.id,
        classification: "INFRACTION",
        content: "AI thinks this is an infraction",
        aiRecommended: true,
        humanConfirmed: false,
        createdById: user.id,
      }),
    ).rejects.toThrow(/human confirmation/);

    // With explicit confirmation it succeeds.
    const entry = await addToDirectorFile(db, {
      directorId: director.id,
      classification: "INFRACTION",
      content: "Confirmed by executive",
      aiRecommended: true,
      humanConfirmed: true,
      createdById: user.id,
    });
    expect(entry.humanConfirmed).toBe(true);
  });
});

describe("infraction engine", () => {
  it("triggers an alert only above the configured threshold", async () => {
    const user = await makeUser();
    const director = await makeDirector();

    for (let i = 0; i < 3; i++) {
      await recordInfraction(db, {
        directorId: director.id,
        category: "ATTENDANCE",
        severity: "MEDIUM",
        description: `Infraction ${i + 1}`,
        recordedById: user.id,
      });
    }
    // Exactly 3 = not more than 3 → no alert.
    expect(await db.alert.count({ where: { type: "INFRACTION_THRESHOLD", entityId: director.id } })).toBe(0);

    await recordInfraction(db, {
      directorId: director.id,
      category: "ATTENDANCE",
      severity: "MEDIUM",
      description: "Infraction 4",
      recordedById: user.id,
    });
    expect(await db.alert.count({ where: { type: "INFRACTION_THRESHOLD", entityId: director.id } })).toBe(1);

    const notices = await db.notification.findMany({ where: { userId: user.id, type: "ALERT" } });
    expect(notices.some((n) => n.entityId === director.id)).toBe(true);
  });

  it("respects an admin-configured threshold and severity floor", async () => {
    const admin = await makeUser("ADMIN");
    const user = await makeUser();
    const director = await makeDirector();
    await setSetting(db, "infraction.alertRule", {
      count: 1,
      windowDays: 30,
      categories: [],
      minSeverity: "HIGH",
      recipients: "ADMINS",
      requireAcknowledgement: true,
    }, admin.id);

    // LOW severity does not qualify even though count exceeds 1.
    await recordInfraction(db, { directorId: director.id, category: "SAFETY", severity: "LOW", description: "minor", recordedById: user.id });
    await recordInfraction(db, { directorId: director.id, category: "SAFETY", severity: "LOW", description: "minor2", recordedById: user.id });
    expect(await db.alert.count({ where: { type: "INFRACTION_THRESHOLD", entityId: director.id } })).toBe(0);

    await recordInfraction(db, { directorId: director.id, category: "SAFETY", severity: "HIGH", description: "serious1", recordedById: user.id });
    await recordInfraction(db, { directorId: director.id, category: "SAFETY", severity: "CRITICAL", description: "serious2", recordedById: user.id });
    expect(await checkInfractionThreshold(db, director.id)).toBe(true);

    // Restore default for other tests.
    await setSetting(db, "infraction.alertRule", {
      count: 3, windowDays: 365, categories: [], minSeverity: "LOW", recipients: "ALL_EXECUTIVES", requireAcknowledgement: true,
    }, admin.id);
  });
});

describe("cross-executive pattern detection", () => {
  it("alerts when separate executives document concerns, without exposing private narrative", async () => {
    const execA = await makeUser("EXECUTIVE", "Exec A");
    const execB = await makeUser("EXECUTIVE", "Exec B");
    const director = await makeDirector(undefined, "Pattern Director");

    await addToDirectorFile(db, { directorId: director.id, classification: "COACHING", content: "PRIVATE-NARRATIVE-A", createdById: execA.id });
    expect(await maybeDetectDirectorPattern(db, director.id)).toBe(false);

    await addToDirectorFile(db, { directorId: director.id, classification: "PERFORMANCE", content: "PRIVATE-NARRATIVE-B", createdById: execB.id });
    const alert = await db.alert.findFirst({ where: { type: "DIRECTOR_PATTERN", entityId: director.id } });
    expect(alert).toBeTruthy();
    // Metadata only — never the private note content.
    expect(alert!.body).not.toContain("PRIVATE-NARRATIVE-A");
    expect(alert!.body).not.toContain("PRIVATE-NARRATIVE-B");
    expect(alert!.body).toContain("2 separate executive sources");
  });

  it("does not alert when one executive documents multiple concerns", async () => {
    const exec = await makeUser();
    const director = await makeDirector(undefined, "Solo Concern Director");
    await addToDirectorFile(db, { directorId: director.id, classification: "COACHING", content: "a", createdById: exec.id });
    await addToDirectorFile(db, { directorId: director.id, classification: "CORRECTIVE", content: "b", createdById: exec.id });
    expect(await db.alert.count({ where: { type: "DIRECTOR_PATTERN", entityId: director.id } })).toBe(0);
  });
});
