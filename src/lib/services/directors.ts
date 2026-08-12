// Director module: director file entries, the infraction engine with an
// admin-configurable alert rule, and cross-executive pattern detection that
// alerts on metadata without exposing private narrative.
import type { Db } from "../db";
import { audit } from "../audit";
import { recordActivity } from "../activity";
import { notify } from "../notify";
import { getSetting } from "../settings";
import { InfractionSeverities } from "../validate";

export async function addToDirectorFile(
  db: Db,
  opts: {
    directorId: string;
    classification: string;
    content: string;
    sourceType?: string;
    sourceId?: string;
    aiRecommended?: boolean;
    humanConfirmed?: boolean;
    visibility?: "PRIVATE" | "SHARED";
    createdById: string;
  },
) {
  // AI may recommend a classification, but a formal infraction requires
  // explicit human confirmation — enforced server-side, not just in the UI.
  if (opts.classification === "INFRACTION" && opts.aiRecommended && opts.humanConfirmed !== true) {
    throw new Error("An infraction classification requires explicit human confirmation.");
  }
  const entry = await db.directorFileEntry.create({
    data: {
      directorId: opts.directorId,
      classification: opts.classification,
      content: opts.content,
      sourceType: opts.sourceType ?? "MANUAL",
      sourceId: opts.sourceId ?? null,
      aiRecommended: opts.aiRecommended ?? false,
      humanConfirmed: opts.humanConfirmed ?? true,
      visibility: opts.visibility ?? "PRIVATE",
      createdById: opts.createdById,
    },
  });
  await audit(db, { actorId: opts.createdById, action: "DIRECTOR_FILE_ADD", entityType: "DIRECTOR_FILE_ENTRY", entityId: entry.id, after: { classification: opts.classification, directorId: opts.directorId } });
  await recordActivity(db, {
    userId: opts.createdById,
    type: "DIRECTOR_FILE_ADD",
    summary: `Added ${opts.classification.toLowerCase()} entry to director file`,
    entityType: "DIRECTOR",
    entityId: opts.directorId,
  });
  await maybeDetectDirectorPattern(db, opts.directorId);
  return entry;
}

export async function recordInfraction(
  db: Db,
  opts: {
    directorId: string;
    siteId?: string;
    category: string;
    severity: string;
    description: string;
    expectedCorrection?: string;
    followUpDate?: Date;
    recordedById: string;
    date?: Date;
  },
) {
  const infraction = await db.infraction.create({
    data: {
      directorId: opts.directorId,
      siteId: opts.siteId ?? null,
      category: opts.category,
      severity: opts.severity,
      description: opts.description,
      expectedCorrection: opts.expectedCorrection ?? null,
      followUpDate: opts.followUpDate ?? null,
      recordedById: opts.recordedById,
      date: opts.date ?? new Date(),
    },
  });
  await audit(db, { actorId: opts.recordedById, action: "INFRACTION_RECORDED", entityType: "INFRACTION", entityId: infraction.id, after: { directorId: opts.directorId, category: opts.category, severity: opts.severity } });
  await recordActivity(db, {
    userId: opts.recordedById,
    type: "INFRACTION_RECORDED",
    summary: `Infraction recorded (${opts.category}, ${opts.severity})`,
    entityType: "DIRECTOR",
    entityId: opts.directorId,
  });
  await checkInfractionThreshold(db, opts.directorId);
  return infraction;
}

/** Admin-configurable rule: count, window, categories, severity, recipients. */
export async function checkInfractionThreshold(db: Db, directorId: string): Promise<boolean> {
  const rule = await getSetting(db, "infraction.alertRule");
  const since = new Date(Date.now() - rule.windowDays * 24 * 60 * 60 * 1000);
  const minSeverityIdx = InfractionSeverities.indexOf(rule.minSeverity);
  const infractions = await db.infraction.findMany({
    where: {
      directorId,
      date: { gte: since },
      ...(rule.categories.length ? { category: { in: rule.categories } } : {}),
    },
  });
  const qualifying = infractions.filter(
    (i) => InfractionSeverities.indexOf(i.severity as (typeof InfractionSeverities)[number]) >= minSeverityIdx,
  );
  if (qualifying.length <= rule.count) return false;

  // One open alert per director per threshold breach — don't spam.
  const existing = await db.alert.findFirst({
    where: { type: "INFRACTION_THRESHOLD", entityType: "DIRECTOR", entityId: directorId },
    orderBy: { createdAt: "desc" },
  });
  const meta = { qualifyingCount: qualifying.length, windowDays: rule.windowDays };
  if (existing && JSON.parse(existing.metadataJson ?? "{}").qualifyingCount === qualifying.length) return true;

  const director = await db.director.findUnique({ where: { id: directorId } });
  const alert = await db.alert.create({
    data: {
      type: "INFRACTION_THRESHOLD",
      title: `Infraction threshold exceeded: ${director?.name ?? "director"}`,
      body: `${qualifying.length} qualifying infractions within ${rule.windowDays} days (threshold: more than ${rule.count}).`,
      entityType: "DIRECTOR",
      entityId: directorId,
      metadataJson: JSON.stringify(meta),
    },
  });
  const recipients = await db.user.findMany({
    where: { active: true, ...(rule.recipients === "ADMINS" ? { role: "ADMIN" } : {}) },
  });
  for (const user of recipients) {
    await notify(db, {
      userId: user.id,
      type: "ALERT",
      title: alert.title,
      body: alert.body ?? undefined,
      entityType: "DIRECTOR",
      entityId: directorId,
    });
  }
  return true;
}

/**
 * Cross-executive pattern detection. Private notes stay private — the alert
 * exposes only counts and executive-source metadata, never the narrative.
 */
export async function maybeDetectDirectorPattern(db: Db, directorId: string): Promise<boolean> {
  const threshold = await getSetting(db, "patterns.directorConcernThreshold");
  const concernClassifications = ["COACHING", "CORRECTIVE", "INFRACTION", "PERFORMANCE"];
  const entries = await db.directorFileEntry.findMany({
    where: { directorId, classification: { in: concernClassifications } },
    select: { createdById: true },
  });
  const distinctExecutives = new Set(entries.map((e) => e.createdById));
  if (distinctExecutives.size < threshold) return false;

  const existing = await db.alert.findFirst({
    where: { type: "DIRECTOR_PATTERN", entityType: "DIRECTOR", entityId: directorId },
  });
  if (existing) return true;

  const director = await db.director.findUnique({ where: { id: directorId } });
  await db.alert.create({
    data: {
      type: "DIRECTOR_PATTERN",
      title: `Pattern alert: ${director?.name ?? "director"}`,
      body:
        `Multiple qualifying leadership concerns involving this director have been recorded by ` +
        `${distinctExecutives.size} separate executive sources. Underlying private notes are not exposed.`,
      entityType: "DIRECTOR",
      entityId: directorId,
      metadataJson: JSON.stringify({ distinctExecutives: distinctExecutives.size }),
    },
  });
  return true;
}

/** Director timeline: file entries, infractions, and linked records merged chronologically. */
export async function directorTimeline(db: Db, directorId: string, viewerId: string) {
  const [entries, infractions] = await Promise.all([
    db.directorFileEntry.findMany({
      where: {
        directorId,
        OR: [{ visibility: "SHARED" }, { createdById: viewerId }],
      },
      orderBy: { createdAt: "desc" },
    }),
    db.infraction.findMany({ where: { directorId }, orderBy: { date: "desc" } }),
  ]);
  const items = [
    ...entries.map((e) => ({ kind: "FILE_ENTRY" as const, date: e.createdAt, data: e })),
    ...infractions.map((i) => ({ kind: "INFRACTION" as const, date: i.date, data: i })),
  ];
  items.sort((a, b) => b.date.getTime() - a.date.getTime());
  return items;
}
