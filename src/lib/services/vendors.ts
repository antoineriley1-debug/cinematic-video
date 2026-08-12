// Vendor intelligence: performance documentation and cross-site recurring
// problem detection (Vendor Pattern Alerts) with supporting evidence.
import type { Db } from "../db";
import { audit } from "../audit";
import { recordActivity } from "../activity";
import { getSetting } from "../settings";
import { notify } from "../notify";

const NEGATIVE_TYPES = [
  "CONCERN",
  "QUALITY_ISSUE",
  "SERVICE_ISSUE",
  "MISSED_REQUIREMENT",
  "MISSED_DEADLINE",
  "CONTRACT_CONCERN",
  "ESCALATION",
];

export async function recordVendorPerformance(
  db: Db,
  opts: { vendorId: string; siteId?: string; type: string; content: string; createdById: string },
) {
  const record = await db.vendorPerformanceRecord.create({
    data: {
      vendorId: opts.vendorId,
      siteId: opts.siteId ?? null,
      type: opts.type,
      content: opts.content,
      createdById: opts.createdById,
    },
  });
  await audit(db, { actorId: opts.createdById, action: "VENDOR_PERFORMANCE_RECORDED", entityType: "VENDOR_PERFORMANCE", entityId: record.id, after: { vendorId: opts.vendorId, type: opts.type } });
  await recordActivity(db, {
    userId: opts.createdById,
    type: "VENDOR_CONCERN_DOCUMENTED",
    summary: `Vendor ${opts.type.replaceAll("_", " ").toLowerCase()} documented`,
    entityType: "VENDOR",
    entityId: opts.vendorId,
  });
  if (NEGATIVE_TYPES.includes(opts.type)) {
    await maybeDetectVendorPattern(db, opts.vendorId);
  }
  return record;
}

/**
 * If several sites independently document problems with the same vendor,
 * raise a Vendor Pattern Alert showing the supporting authorized evidence.
 */
export async function maybeDetectVendorPattern(db: Db, vendorId: string): Promise<boolean> {
  const threshold = await getSetting(db, "patterns.vendorSiteThreshold");
  const negatives = await db.vendorPerformanceRecord.findMany({
    where: { vendorId, type: { in: NEGATIVE_TYPES }, siteId: { not: null } },
  });
  const distinctSites = new Set(negatives.map((n) => n.siteId));
  if (distinctSites.size < threshold) return false;

  const existing = await db.alert.findFirst({ where: { type: "VENDOR_PATTERN", entityType: "VENDOR", entityId: vendorId } });
  const meta = { distinctSites: distinctSites.size, evidenceIds: negatives.map((n) => n.id) };
  if (existing && JSON.parse(existing.metadataJson ?? "{}").distinctSites === distinctSites.size) return true;

  const vendor = await db.vendor.findUnique({ where: { id: vendorId } });
  const alert = await db.alert.create({
    data: {
      type: "VENDOR_PATTERN",
      title: `Vendor pattern alert: ${vendor?.name ?? "vendor"}`,
      body: `${distinctSites.size} sites have independently documented problems with this vendor. Supporting records are attached as evidence.`,
      entityType: "VENDOR",
      entityId: vendorId,
      metadataJson: JSON.stringify(meta),
    },
  });
  const executives = await db.user.findMany({ where: { active: true } });
  for (const user of executives) {
    await notify(db, { userId: user.id, type: "ALERT", title: alert.title, body: alert.body ?? undefined, entityType: "VENDOR", entityId: vendorId });
  }
  return true;
}
