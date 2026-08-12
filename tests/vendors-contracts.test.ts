import { describe, it, expect } from "vitest";
import { db, makeUser, makeSite, makeVendor } from "./helpers";
import { recordVendorPerformance, maybeDetectVendorPattern } from "@/lib/services/vendors";
import { contractWatch, acknowledgeWatchItem, daysUntil } from "@/lib/services/contracts";

describe("vendor performance intelligence", () => {
  it("raises a pattern alert when multiple sites document problems", async () => {
    const user = await makeUser();
    const vendor = await makeVendor("Flaky Fire Alarm Co");
    const siteA = await makeSite();
    const siteB = await makeSite();

    await recordVendorPerformance(db, { vendorId: vendor.id, siteId: siteA.id, type: "QUALITY_ISSUE", content: "Missed inspection window", createdById: user.id });
    expect(await db.alert.count({ where: { type: "VENDOR_PATTERN", entityId: vendor.id } })).toBe(0);

    await recordVendorPerformance(db, { vendorId: vendor.id, siteId: siteB.id, type: "SERVICE_ISSUE", content: "Late response to alarm fault", createdById: user.id });
    const alert = await db.alert.findFirst({ where: { type: "VENDOR_PATTERN", entityId: vendor.id } });
    expect(alert).toBeTruthy();
    // Evidence references are attached.
    expect(JSON.parse(alert!.metadataJson!).evidenceIds.length).toBe(2);
  });

  it("positive records never trigger pattern alerts", async () => {
    const user = await makeUser();
    const vendor = await makeVendor();
    const siteA = await makeSite();
    const siteB = await makeSite();
    await recordVendorPerformance(db, { vendorId: vendor.id, siteId: siteA.id, type: "POSITIVE", content: "great", createdById: user.id });
    await recordVendorPerformance(db, { vendorId: vendor.id, siteId: siteB.id, type: "POSITIVE", content: "great", createdById: user.id });
    expect(await maybeDetectVendorPattern(db, vendor.id)).toBe(false);
  });
});

describe("contract watch", () => {
  const inDays = (n: number) => new Date(Date.now() + n * 24 * 3600 * 1000);

  it("surfaces contracts inside the window with countdowns; outside stays hidden", async () => {
    const user = await makeUser();
    const vendor = await makeVendor();
    const inside = await db.contract.create({ data: { title: "Inside Window " + Date.now(), vendorId: vendor.id, endDate: inDays(45) } });
    await db.contract.create({ data: { title: "Outside Window " + Date.now(), vendorId: vendor.id, endDate: inDays(200) } });

    const watch = await contractWatch(db, user.id);
    const insideItem = watch.find((w) => w.contractId === inside.id);
    expect(insideItem).toBeTruthy();
    expect(insideItem!.daysRemaining).toBeGreaterThanOrEqual(44);
    expect(insideItem!.daysRemaining).toBeLessThanOrEqual(46);
    expect(watch.some((w) => w.title.startsWith("Outside Window"))).toBe(false);
  });

  it("acknowledgement is per-executive and does not affect others", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    const contract = await db.contract.create({ data: { title: "Ack Test " + Date.now(), endDate: inDays(30) } });

    await acknowledgeWatchItem(db, userA.id, contract.id, "EXPIRATION");

    const watchA = (await contractWatch(db, userA.id)).find((w) => w.contractId === contract.id);
    const watchB = (await contractWatch(db, userB.id)).find((w) => w.contractId === contract.id);
    expect(watchA!.acknowledged).toBe(true);
    expect(watchB!.acknowledged).toBe(false);
    // The deadline itself remains visible on the record for everyone.
    expect(watchA!.daysRemaining).toBe(watchB!.daysRemaining);
  });

  it("computes day countdowns correctly", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(daysUntil(new Date("2026-04-01T00:00:00Z"), now)).toBe(90);
    expect(daysUntil(new Date("2026-01-31T00:00:00Z"), now)).toBe(30);
  });
});
