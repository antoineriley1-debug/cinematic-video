// GLOBAL INTEGRATION VALIDATION (Master Spec §44): the complete cross-module
// chain must work end to end — email → vendor → contract → deadline →
// briefing → collaboration → pattern alert → chief of staff → search →
// activity calendar → export.
import { describe, it, expect } from "vitest";
import { db, makeUser, mockOrchestrator, uniq } from "./helpers";
import { ingestEmail } from "@/lib/services/emails";
import { link, linksFor, confirmLink } from "@/lib/links";
import { recordVendorPerformance } from "@/lib/services/vendors";
import { buildBriefing } from "@/lib/services/briefing";
import { askChief } from "@/lib/services/chief";
import { searchAll } from "@/lib/search";
import { activityBetween } from "@/lib/activity";
import { vendorReport } from "@/lib/services/exports";
import { deliverMentions } from "@/lib/notify";

describe("global integration: everything connects", () => {
  it("runs the full §44 chain", async () => {
    const marker = uniq("boilerx");
    const antoine = await makeUser("EXECUTIVE", "Antoine Riley");
    const heather = await makeUser("EXECUTIVE", "Heather Collins");

    const site = await db.site.create({ data: { name: `Site A ${marker}`, code: uniq("SA") } });
    const vendor = await db.vendor.create({ data: { name: `Boiler Services ${marker}` } });
    const siteB = await db.site.create({ data: { name: `Site B ${marker}`, code: uniq("SB") } });
    const contract = await db.contract.create({
      data: {
        title: `Boiler Maintenance Contract ${marker}`,
        vendorId: vendor.id,
        endDate: new Date(Date.now() + 60 * 24 * 3600 * 1000),
        terms: `Vendor shall maintain all boilers at Site A ${marker}. Renewal notice due 30 days before expiration.`,
      },
    });
    await db.contractSite.create({ data: { contractId: contract.id, siteId: site.id } });
    await db.vendorSite.create({ data: { vendorId: vendor.id, siteId: site.id } });

    // 1-2. Import vendor email; AI identifies Site A.
    const analysisJson = JSON.stringify({
      summary: `Boiler Services ${marker} reports a deadline for contract renewal at Site A ${marker}.`,
      intent: "DEADLINE", urgency: "HIGH",
      bullets: ["Renewal deadline approaching"], actions: ["Confirm renewal intent"],
      dates: [{ text: "in 60 days" }], people: [],
      sites: [`Site A ${marker}`], directors: [], vendors: [`Boiler Services ${marker}`],
      contracts: [`Boiler Maintenance Contract ${marker}`], projects: [],
    });
    const { orchestrator } = mockOrchestrator({ primaryResponder: (req) => (req.capability === "email.analyze" ? analysisJson : `Grounded answer about the boiler contract ${marker} [SOURCE 1]`) });
    const eml = `From: rep@boilerservices.com\nSubject: Renewal deadline for boiler contract ${marker}\nDate: Mon, 2 Feb 2026 09:00:00 -0500\nContent-Type: text/plain\n\nThe boiler maintenance contract ${marker} at Site A ${marker} must be renewed. Please confirm by the deadline.`;
    const ingest = await ingestEmail(db, orchestrator, { rawSource: eml, uploadedById: antoine.id });
    expect(ingest.pendingSuggestions).toBe(3); // site, vendor, contract suggested

    // 3-4. Human confirms the suggested relationships.
    const pending = await db.link.findMany({ where: { fromType: "EMAIL", fromId: ingest.emailId, confirmed: false } });
    for (const l of pending) await confirmLink(db, l.id);
    const emailLinks = await linksFor(db, { type: "EMAIL", id: ingest.emailId }, { confirmedOnly: true });
    expect(emailLinks.length).toBe(3);

    // 5-6. Deadline extracted → action item on the calendar.
    await db.actionItem.create({
      data: { kind: "DEADLINE", title: `Confirm boiler contract renewal ${marker}`, dueDate: new Date(Date.now() + 5 * 24 * 3600 * 1000), sourceType: "EMAIL", sourceId: ingest.emailId, createdById: antoine.id, ownerId: antoine.id },
    });

    // 7. Deadline + contract watch enter the briefing.
    const briefing = await buildBriefing(db, antoine.id);
    expect(briefing.items.some((i) => i.title.includes(`Confirm boiler contract renewal ${marker}`))).toBe(true);
    expect(briefing.contractWatch.some((w) => w.contractId === contract.id)).toBe(true);

    // 8-10. Executive documents a vendor concern; makes a public note; another executive is mentioned.
    const note = await db.note.create({
      data: { title: `Boiler vendor concern ${marker}`, content: `@Heather boiler vendor ${marker} missed two service windows`, authorId: antoine.id, visibility: "PUBLIC" },
    });
    await link(db, { type: "NOTE", id: note.id }, { type: "VENDOR", id: vendor.id }, { createdById: antoine.id });
    await deliverMentions(db, { text: note.content, actorId: antoine.id, actorName: "Antoine Riley", entityType: "NOTE", entityId: note.id, contextTitle: note.title! });
    const mention = await db.notification.findFirst({ where: { userId: heather.id, type: "MENTION", entityId: note.id } });
    expect(mention).toBeTruthy();
    const comment = await db.comment.create({ data: { entityType: "NOTE", entityId: note.id, authorId: heather.id, content: "Agreed — escalating." } });
    expect(comment.id).toBeTruthy();

    // 11-12. Vendor threshold reached across two sites → vendor pattern alert.
    await recordVendorPerformance(db, { vendorId: vendor.id, siteId: site.id, type: "MISSED_DEADLINE", content: `missed window at Site A ${marker}`, createdById: antoine.id });
    await recordVendorPerformance(db, { vendorId: vendor.id, siteId: siteB.id, type: "SERVICE_ISSUE", content: `slow response at Site B ${marker}`, createdById: heather.id });
    const alert = await db.alert.findFirst({ where: { type: "VENDOR_PATTERN", entityId: vendor.id } });
    expect(alert).toBeTruthy();

    // 13. AI Chief of Staff answers using the related records with sources.
    const chief = await askChief(db, orchestrator, antoine.id, null, `What happened with the boiler contract ${marker}?`);
    expect(chief.answer).toContain("SOURCE");
    expect(chief.sources.length).toBeGreaterThan(0);

    // 14. Search retrieves the chain.
    const hits = await searchAll(db, antoine.id, marker);
    const types = new Set(hits.map((h) => h.type));
    expect(types.has("Vendor")).toBe(true);
    expect(types.has("Contract")).toBe(true);
    expect(types.has("Email")).toBe(true);
    expect(types.has("Public Note")).toBe(true);

    // 15. Activity calendar reconstructs the events.
    const events = await activityBetween(db, antoine.id, new Date(Date.now() - 24 * 3600 * 1000), new Date());
    expect(events.some((e) => e.type === "EMAIL_ANALYZED")).toBe(true);
    expect(events.some((e) => e.type === "VENDOR_CONCERN_DOCUMENTED")).toBe(true);

    // 16. Export creates a traceable report.
    const report = await vendorReport(db, vendor.id);
    expect(report).toContain(`Boiler Services ${marker}`);
    expect(report).toContain("MISSED_DEADLINE");
    expect(report).toContain(`/vendors/${vendor.id}`); // source attribution preserved
  });
});
