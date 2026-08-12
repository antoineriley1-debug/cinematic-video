import { describe, it, expect } from "vitest";
import { db, makeUser, mockOrchestrator, uniq, EMAIL_ANALYSIS_JSON, MEETING_ANALYSIS_JSON } from "./helpers";
import { ingestEmail } from "@/lib/services/emails";
import { uploadMeeting } from "@/lib/services/meetings";
import { drainAiQueue } from "@/lib/services/aiQueue";

const EML = (marker: string) =>
  `From: a@b.c\nSubject: Queued ${marker}\nDate: Tue, 27 Jan 2026 09:15:00 -0500\nContent-Type: text/plain\n\nUrgent boiler issue, please respond.`;

describe("AI queue drain worker", () => {
  it("re-processes outage-queued email analysis when providers recover", async () => {
    const user = await makeUser();
    const { orchestrator, primary, secondary } = mockOrchestrator({ primaryResponder: () => EMAIL_ANALYSIS_JSON });
    primary.up = false;
    secondary.up = false;

    const result = await ingestEmail(db, orchestrator, { rawSource: EML(uniq("q1")), uploadedById: user.id });
    let email = await db.emailMessage.findUniqueOrThrow({ where: { id: result.emailId } });
    expect(email.analysisMode).toBe("EMERGENCY");
    expect(await db.aiQueueItem.count({ where: { status: "QUEUED" } })).toBeGreaterThan(0);

    // Providers recover.
    primary.up = true;
    const drained = await drainAiQueue(db, orchestrator);
    expect(drained.processed).toBeGreaterThan(0);
    expect(drained.remaining).toBe(0);

    email = await db.emailMessage.findUniqueOrThrow({ where: { id: result.emailId } });
    expect(email.analysisMode).toBe("AI");
    expect(email.summary).not.toContain("[Deterministic]");
    const item = await db.aiQueueItem.findFirst({ orderBy: { createdAt: "desc" } });
    expect(item!.status).toBe("DONE");
    expect(item!.processedAt).not.toBeNull();
  });

  it("re-processes queued meeting analysis on recovery", async () => {
    const user = await makeUser();
    const { orchestrator, primary, secondary } = mockOrchestrator({ primaryResponder: () => MEETING_ANALYSIS_JSON });
    primary.up = false;
    secondary.up = false;

    const { meetingId, mode } = await uploadMeeting(db, orchestrator, {
      title: uniq("Queued meeting"),
      minutesText: "We decided to approve the budget.",
      uploadedById: user.id,
    });
    expect(mode).toBe("EMERGENCY");

    primary.up = true;
    await drainAiQueue(db, orchestrator);
    const meeting = await db.meeting.findUniqueOrThrow({ where: { id: meetingId } });
    expect(meeting.analysisMode).toBe("AI");
  });

  it("leaves items queued when providers are still down — no work is lost", async () => {
    const user = await makeUser();
    const { orchestrator, primary, secondary } = mockOrchestrator();
    primary.up = false;
    secondary.up = false;

    await ingestEmail(db, orchestrator, { rawSource: EML(uniq("q2")), uploadedById: user.id });
    const before = await db.aiQueueItem.count({ where: { status: "QUEUED" } });
    expect(before).toBeGreaterThan(0);

    const drained = await drainAiQueue(db, orchestrator); // still down
    expect(drained.processed).toBe(0);
    expect(await db.aiQueueItem.count({ where: { status: "QUEUED" } })).toBe(before);
  });

  it("retires queue items whose source record was deleted", async () => {
    await db.aiQueueItem.create({ data: { capability: "email.analyze", payloadJson: JSON.stringify({ emailId: "gone-" + uniq("x") }) } });
    const { orchestrator } = mockOrchestrator();
    const drained = await drainAiQueue(db, orchestrator);
    expect(drained.processed).toBeGreaterThan(0);
  });
});
