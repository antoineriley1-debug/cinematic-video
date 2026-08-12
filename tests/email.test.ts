import { describe, it, expect } from "vitest";
import { parseEml } from "@/lib/email/parse";
import { ingestEmail, buildTimeline, exportTimelineText } from "@/lib/services/emails";
import { db, makeUser, makeSite, mockOrchestrator, EMAIL_ANALYSIS_JSON, uniq } from "./helpers";

const SAMPLE_EML = `From: "Jane Delgado" <jane.delgado@mercygeneral.org>
To: antoine@crothall-demo.local
Cc: heather@crothall-demo.local
Subject: Fire alarm inspection results
Date: Tue, 27 Jan 2026 09:15:00 -0500
Content-Type: text/plain; charset=utf-8

The quarterly fire alarm inspection failed in the east wing.
Guardian must schedule a repair. Please respond by February 3, 2026.
`;

describe("email parsing", () => {
  it("parses RFC-822 headers and body", () => {
    const parsed = parseEml(SAMPLE_EML);
    expect(parsed.subject).toBe("Fire alarm inspection results");
    expect(parsed.fromAddress).toBe("jane.delgado@mercygeneral.org");
    expect(parsed.fromName).toBe("Jane Delgado");
    expect(parsed.to).toContain("antoine@crothall-demo.local");
    expect(parsed.cc).toContain("heather@crothall-demo.local");
    expect(parsed.sentAt?.getUTCFullYear()).toBe(2026);
    expect(parsed.bodyText).toContain("east wing");
  });

  it("decodes quoted-printable bodies", () => {
    const eml = `From: a@b.c\nSubject: QP test\nContent-Type: text/plain\nContent-Transfer-Encoding: quoted-printable\n\nCaf=C3=A9 corrective plan =\ncontinues here.`;
    const parsed = parseEml(eml);
    expect(parsed.bodyText).toContain("Café corrective plan continues here.");
  });

  it("parses multipart messages preferring text/plain", () => {
    const eml = [
      "From: x@y.z",
      "Subject: Multipart",
      'Content-Type: multipart/alternative; boundary="BOUND"',
      "",
      "--BOUND",
      "Content-Type: text/plain",
      "",
      "plain body here",
      "--BOUND",
      "Content-Type: text/html",
      "",
      "<p>html body</p>",
      "--BOUND--",
    ].join("\r\n");
    const parsed = parseEml(eml);
    expect(parsed.bodyText).toBe("plain body here");
  });

  it("falls back to pasted-email parsing", () => {
    const pasted = `From: John Smith <john@vendor.com>\nSent: Monday, February 3, 2026 10:00 AM\nTo: antoine@crothall-demo.local\nSubject: Re: Fire alarm inspection\n\nWe will send a technician Thursday.`;
    const parsed = parseEml(pasted);
    expect(parsed.subject).toBe("Re: Fire alarm inspection");
    expect(parsed.bodyText).toContain("technician Thursday");
  });

  it("handles malformed input without throwing", () => {
    const parsed = parseEml("complete garbage \x00\x01 with no structure");
    expect(parsed.subject).toBe("");
    expect(typeof parsed.bodyText).toBe("string");
  });
});

describe("email ingestion", () => {
  it("ingests, analyzes, preserves source, and records activity", async () => {
    const user = await makeUser();
    const { orchestrator } = mockOrchestrator({ primaryResponder: () => EMAIL_ANALYSIS_JSON });
    const result = await ingestEmail(db, orchestrator, { rawSource: SAMPLE_EML + uniq("x"), uploadedById: user.id });

    expect(result.duplicate).toBe(false);
    expect(result.mode).toBe("AI");
    const email = await db.emailMessage.findUniqueOrThrow({ where: { id: result.emailId } });
    expect(email.rawSource).toContain("quarterly fire alarm inspection"); // original preserved
    expect(email.summary).toContain("fire alarm");
    expect(email.urgency).toBe("HIGH");
    expect(email.analysisStatus).toBe("ANALYZED");

    const activity = await db.activityEvent.findMany({ where: { userId: user.id, type: "EMAIL_ANALYZED" } });
    expect(activity.length).toBe(1);
    const auditRows = await db.auditLog.findMany({ where: { entityType: "EMAIL", entityId: result.emailId } });
    expect(auditRows.length).toBe(1);
  });

  it("detects duplicate emails by content hash", async () => {
    const user = await makeUser();
    const { orchestrator } = mockOrchestrator({ primaryResponder: () => EMAIL_ANALYSIS_JSON });
    const raw = SAMPLE_EML + uniq("dupe");
    const first = await ingestEmail(db, orchestrator, { rawSource: raw, uploadedById: user.id });
    const second = await ingestEmail(db, orchestrator, { rawSource: raw, uploadedById: user.id });
    expect(second.duplicate).toBe(true);
    expect(second.emailId).toBe(first.emailId);
    expect(await db.emailMessage.count({ where: { id: first.emailId } })).toBe(1);
  });

  it("stores AI entity suggestions as unconfirmed links awaiting human confirmation", async () => {
    const user = await makeUser();
    const site = await makeSite("Mercy General Hospital " + uniq("s"));
    const analysis = { ...JSON.parse(EMAIL_ANALYSIS_JSON), sites: [site.name] };
    const { orchestrator } = mockOrchestrator({ primaryResponder: () => JSON.stringify(analysis) });
    const result = await ingestEmail(db, orchestrator, { rawSource: SAMPLE_EML + uniq("links"), uploadedById: user.id });

    expect(result.pendingSuggestions).toBe(1);
    const links = await db.link.findMany({ where: { fromType: "EMAIL", fromId: result.emailId } });
    expect(links.length).toBe(1);
    expect(links[0].confirmed).toBe(false);
    expect(links[0].suggestedBy).toBe("AI");
  });

  it("degrades to emergency mode when all providers are down, queues AI work, loses nothing", async () => {
    const user = await makeUser();
    const { orchestrator, primary, secondary } = mockOrchestrator();
    primary.up = false;
    secondary.up = false;

    const raw = SAMPLE_EML.replace("east wing", "URGENT east wing failure") + uniq("em");
    const result = await ingestEmail(db, orchestrator, { rawSource: raw, uploadedById: user.id });
    expect(result.mode).toBe("EMERGENCY");
    const email = await db.emailMessage.findUniqueOrThrow({ where: { id: result.emailId } });
    expect(email.analysisMode).toBe("EMERGENCY");
    expect(email.summary).toContain("[Deterministic]");
    expect(email.rawSource).toBe(raw); // nothing lost

    const queued = await db.aiQueueItem.findMany({ where: { capability: "email.analyze" } });
    expect(queued.some((q) => JSON.parse(q.payloadJson).emailId === result.emailId)).toBe(true);
  });

  it("builds a chronological timeline across a batch and exports it", async () => {
    const user = await makeUser();
    const { orchestrator } = mockOrchestrator({ primaryResponder: () => EMAIL_ANALYSIS_JSON });
    const batch = await db.emailBatch.create({ data: { title: "Fire alarm thread", createdById: user.id } });

    const emlAt = (dateStr: string, sender: string, marker: string) =>
      `From: ${sender}\nTo: antoine@crothall-demo.local\nSubject: Thread update ${marker}\nDate: ${dateStr}\nContent-Type: text/plain\n\nUpdate content ${marker}.`;

    // Ingested out of order on purpose.
    await ingestEmail(db, orchestrator, { rawSource: emlAt("Tue, 3 Feb 2026 08:00:00 -0500", "john@vendor.com", "second"), uploadedById: user.id, batchId: batch.id });
    await ingestEmail(db, orchestrator, { rawSource: emlAt("Tue, 27 Jan 2026 08:00:00 -0500", "jane@mercy.org", "first"), uploadedById: user.id, batchId: batch.id });
    await ingestEmail(db, orchestrator, { rawSource: emlAt("Tue, 10 Feb 2026 08:00:00 -0500", "jane@mercy.org", "third"), uploadedById: user.id, batchId: batch.id });

    const timeline = await buildTimeline(db, { batchId: batch.id });
    expect(timeline.length).toBe(3);
    expect(timeline[0].subject).toContain("first");
    expect(timeline[1].subject).toContain("second");
    expect(timeline[2].subject).toContain("third");

    const text = exportTimelineText(timeline, "Fire alarm thread");
    expect(text).toContain("EMAIL CHRONOLOGY");
    expect(text.indexOf("first")).toBeLessThan(text.indexOf("second"));
    expect(text).toContain("Source email ID");
  });
});
