// Site Visit Mode: structured observation capture during a visit; completion
// produces a structured visit record plus a calendar activity.
import type { Db } from "../db";
import { audit } from "../audit";
import { recordActivity } from "../activity";

export async function startVisit(db: Db, siteId: string, executiveId: string) {
  const visit = await db.siteVisit.create({ data: { siteId, executiveId } });
  await audit(db, { actorId: executiveId, action: "SITE_VISIT_STARTED", entityType: "SITE_VISIT", entityId: visit.id, after: { siteId } });
  return visit;
}

export async function addVisitObservation(
  db: Db,
  opts: { visitId: string; category: string; content: string; createdById: string },
) {
  const visit = await db.siteVisit.findUniqueOrThrow({ where: { id: opts.visitId } });
  const obs = await db.siteObservation.create({
    data: {
      siteId: visit.siteId,
      visitId: visit.id,
      category: opts.category,
      content: opts.content,
      createdById: opts.createdById,
    },
  });
  return obs;
}

export async function completeVisit(db: Db, visitId: string, executiveId: string, summary?: string) {
  const visit = await db.siteVisit.update({
    where: { id: visitId },
    data: { status: "COMPLETED", completedAt: new Date(), summary: summary ?? null },
    include: { site: true, observations: true },
  });
  await audit(db, { actorId: executiveId, action: "SITE_VISIT_COMPLETED", entityType: "SITE_VISIT", entityId: visitId, after: { observations: visit.observations.length } });
  await recordActivity(db, {
    userId: executiveId,
    type: "SITE_VISIT",
    summary: `Site visit completed at ${visit.site.name} (${visit.observations.length} observations)`,
    entityType: "SITE_VISIT",
    entityId: visitId,
  });
  return visit;
}
