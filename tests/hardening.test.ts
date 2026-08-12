import { describe, it, expect } from "vitest";
import { db, makeUser, makeVendor, mockOrchestrator, uniq, EMAIL_ANALYSIS_JSON } from "./helpers";
import { isLoginThrottled, recordFailedLogin } from "@/lib/loginThrottle";
import { setSetting } from "@/lib/settings";
import { resolvePersonalityRules, draftEmailReply } from "@/lib/ai/capabilities";
import { PERSONALITY_PROFILES } from "@/lib/ai/personalities";
import { searchAll, searchTerms } from "@/lib/search";
import { recordInfraction } from "@/lib/services/directors";
import { makeDirector } from "./helpers";
import { buildBriefing } from "@/lib/services/briefing";
import { projectReport, contractReport } from "@/lib/services/exports";
import { parseEml } from "@/lib/email/parse";
import { ingestEmail } from "@/lib/services/emails";

describe("rate limiting", () => {
  it("blocks a key after exceeding the limit and resets after the window", async () => {
    const { isRateLimited, resetRateLimits } = await import("@/lib/ratelimit");
    resetRateLimits();
    const now = Date.now();
    for (let i = 0; i < 15; i++) expect(isRateLimited("login:1.2.3.4", 15, 60_000, now)).toBe(false);
    expect(isRateLimited("login:1.2.3.4", 15, 60_000, now)).toBe(true);
    // A different key is unaffected.
    expect(isRateLimited("login:5.6.7.8", 15, 60_000, now)).toBe(false);
    // After the window rolls over, the key is admitted again.
    expect(isRateLimited("login:1.2.3.4", 15, 60_000, now + 61_000)).toBe(false);
    resetRateLimits();
  });
});

describe("login throttling", () => {
  it("blocks after the configured number of failures within the window", async () => {
    const email = `${uniq("throttle")}@test.local`;
    expect(await isLoginThrottled(db, email)).toBe(false);
    for (let i = 0; i < 8; i++) await recordFailedLogin(db, email);
    expect(await isLoginThrottled(db, email)).toBe(true);
    // A different account is unaffected.
    expect(await isLoginThrottled(db, `${uniq("other")}@test.local`)).toBe(false);
  });

  it("respects an admin-configured failure limit", async () => {
    const admin = await makeUser("ADMIN");
    await setSetting(db, "security.loginMaxFailures", 2, admin.id);
    const email = `${uniq("strict")}@test.local`;
    await recordFailedLogin(db, email);
    expect(await isLoginThrottled(db, email)).toBe(false);
    await recordFailedLogin(db, email);
    expect(await isLoginThrottled(db, email)).toBe(true);
    await setSetting(db, "security.loginMaxFailures", 8, admin.id);
  });
});

describe("admin-editable personality rules", () => {
  it("merges admin overrides over code-defined rules and uses them in drafting prompts", async () => {
    const admin = await makeUser("ADMIN");
    const defaults = await resolvePersonalityRules(db, "FIRM");
    expect(defaults).toEqual(PERSONALITY_PROFILES.FIRM.rules);

    const custom = ["always open with the site name", "cite the contract clause", "close with a deadline"];
    await setSetting(db, "personalities.overrides", { FIRM: custom }, admin.id);
    expect(await resolvePersonalityRules(db, "FIRM")).toEqual(custom);

    const { orchestrator, primary } = mockOrchestrator({ primaryResponder: () => "draft" });
    await draftEmailReply(db, orchestrator, "FIRM", { senderName: "A", subject: "s", issue: "x" }, "original");
    const prompt = primary.calls.at(-1)!.prompt;
    expect(prompt).toContain("always open with the site name");
    expect(prompt).not.toContain("direct opening"); // replaced, not appended

    // Other personalities keep their defaults.
    expect(await resolvePersonalityRules(db, "COACHING")).toEqual(PERSONALITY_PROFILES.COACHING.rules);
    await setSetting(db, "personalities.overrides", {}, admin.id);
  });
});

describe("natural-language search", () => {
  it("matches multi-word queries where no record contains the exact phrase", async () => {
    const user = await makeUser();
    const marker = uniq("boilerx");
    await makeVendor(`${marker} Mechanical Services`);
    const hits = await searchAll(db, user.id, `${marker} chiller maintenance problems`);
    expect(hits.some((h) => h.type === "Vendor" && h.title.includes(marker))).toBe(true);
  });

  it("ranks exact-phrase matches above single-term matches", async () => {
    const user = await makeUser();
    const marker = uniq("rankq");
    await db.note.create({ data: { title: `${marker} alpha`, content: `mentions ${marker} once`, authorId: user.id, visibility: "PRIVATE" } });
    await db.note.create({ data: { title: `${marker} exact`, content: `contains ${marker} boiler failure exactly`, authorId: user.id, visibility: "PRIVATE" } });
    const hits = await searchAll(db, user.id, `${marker} boiler failure`);
    expect(hits[0].title).toContain("exact");
  });

  it("drops stopwords when tokenizing", () => {
    expect(searchTerms("what happened with the boiler contract")).toEqual(["happened", "boiler", "contract"]);
  });
});

describe("configurable infraction-alert acknowledgement", () => {
  it("briefing infraction alerts follow the admin acknowledgement rule", async () => {
    const admin = await makeUser("ADMIN");
    const user = await makeUser();
    const director = await makeDirector(undefined, uniq("AckRule Director"));
    for (let i = 0; i < 4; i++) {
      await recordInfraction(db, { directorId: director.id, category: "SAFETY", severity: "MEDIUM", description: `i${i}`, recordedById: user.id });
    }
    const alert = await db.alert.findFirstOrThrow({ where: { type: "INFRACTION_THRESHOLD", entityId: director.id } });

    let briefing = await buildBriefing(db, user.id);
    expect(briefing.items.find((i) => i.key === `alert:${alert.id}`)?.requiresAck).toBe(true);

    await setSetting(db, "infraction.alertRule", {
      count: 3, windowDays: 365, categories: [], minSeverity: "LOW", recipients: "ALL_EXECUTIVES", requireAcknowledgement: false,
    }, admin.id);
    briefing = await buildBriefing(db, user.id);
    expect(briefing.items.find((i) => i.key === `alert:${alert.id}`)?.requiresAck).toBe(false);

    await setSetting(db, "infraction.alertRule", {
      count: 3, windowDays: 365, categories: [], minSeverity: "LOW", recipients: "ALL_EXECUTIVES", requireAcknowledgement: true,
    }, admin.id);
  });
});

describe("email attachment extraction", () => {
  const emlWithAttachment = (marker: string) => [
    "From: sender@vendor.com",
    "To: antoine@crothall-demo.local",
    `Subject: Inspection report ${marker}`,
    "Date: Tue, 27 Jan 2026 09:15:00 -0500",
    'Content-Type: multipart/mixed; boundary="MIXBOUND"',
    "",
    "--MIXBOUND",
    "Content-Type: text/plain",
    "",
    "Report attached. Please review the findings.",
    "--MIXBOUND",
    'Content-Type: application/pdf; name="inspection-report.pdf"',
    "Content-Transfer-Encoding: base64",
    'Content-Disposition: attachment; filename="inspection-report.pdf"',
    "",
    Buffer.from(`PDF-CONTENT-${marker}`).toString("base64"),
    "--MIXBOUND--",
  ].join("\r\n");

  it("parses attachments out of multipart emails without polluting the body", () => {
    const parsed = parseEml(emlWithAttachment("p1"));
    expect(parsed.bodyText).toBe("Report attached. Please review the findings.");
    expect(parsed.attachments.length).toBe(1);
    expect(parsed.attachments[0].filename).toBe("inspection-report.pdf");
    expect(parsed.attachments[0].mimeType).toBe("application/pdf");
    expect(parsed.attachments[0].content.toString()).toBe("PDF-CONTENT-p1");
  });

  it("stores attachments as files linked to the email, deduplicated by content", async () => {
    const user = await makeUser();
    const { orchestrator } = mockOrchestrator({ primaryResponder: () => EMAIL_ANALYSIS_JSON });
    const marker = uniq("att");
    const result = await ingestEmail(db, orchestrator, { rawSource: emlWithAttachment(marker), uploadedById: user.id });
    const files = await db.storedFile.findMany({ where: { entityType: "EMAIL", entityId: result.emailId } });
    expect(files.length).toBe(1);
    expect(files[0].filename).toBe("inspection-report.pdf");
    expect(files[0].sha256).toHaveLength(64);
  });
});

describe("project and contract reports", () => {
  it("exports a contract report with terms, deadlines, concerns, and source attribution", async () => {
    const user = await makeUser();
    const vendor = await makeVendor(uniq("ReportVendor"));
    const contract = await db.contract.create({
      data: { title: uniq("Report Contract"), vendorId: vendor.id, terms: "Termination requires 60 days notice.", endDate: new Date(Date.now() + 40 * 86400e3) },
    });
    await db.vendorPerformanceRecord.create({
      data: { vendorId: vendor.id, type: "CONTRACT_CONCERN", content: "Missed SLA twice", createdById: user.id },
    });
    const report = await contractReport(db, contract.id);
    expect(report).toContain("Termination requires 60 days notice.");
    expect(report).toContain("Missed SLA twice");
    expect(report).toContain(`/contracts/${contract.id}`);
  });

  it("exports a project report with actions and discussion", async () => {
    const user = await makeUser();
    const project = await db.project.create({ data: { name: uniq("Report Project"), createdById: user.id, description: "Rebuild program" } });
    await db.comment.create({ data: { entityType: "PROJECT", entityId: project.id, authorId: user.id, content: "Kickoff done" } });
    const report = await projectReport(db, project.id);
    expect(report).toContain("Rebuild program");
    expect(report).toContain("Kickoff done");
  });
});
