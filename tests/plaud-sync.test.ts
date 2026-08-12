import { describe, it, expect, afterEach } from "vitest";
import { db, makeUser, mockOrchestrator, uniq, MEETING_ANALYSIS_JSON } from "./helpers";
import { syncFromPlaud, plaudConfigured } from "@/lib/services/plaudSync";

const savedKey = process.env.PLAUD_API_KEY;
afterEach(() => {
  if (savedKey === undefined) delete process.env.PLAUD_API_KEY;
  else process.env.PLAUD_API_KEY = savedKey;
});

function stubApi(payload: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
}

describe("Plaud API sync", () => {
  it("refuses to run without a key", async () => {
    delete process.env.PLAUD_API_KEY;
    expect(plaudConfigured()).toBe(false);
    const { orchestrator } = mockOrchestrator();
    const user = await makeUser("ADMIN");
    await expect(syncFromPlaud(db, orchestrator, { userId: user.id })).rejects.toThrow(/PLAUD_API_KEY/);
  });

  it("imports listed recordings through the standard pipeline with analysis, audit, and notification", async () => {
    process.env.PLAUD_API_KEY = "test-plaud-key";
    const user = await makeUser("ADMIN");
    const { orchestrator } = mockOrchestrator({ primaryResponder: () => MEETING_ANALYSIS_JSON });
    const ext = uniq("plaud");

    const result = await syncFromPlaud(db, orchestrator, {
      userId: user.id,
      fetchImpl: stubApi({
        recordings: [
          { id: ext, title: "Morning huddle at Mercy General", created_at: "2026-08-10T09:00:00Z", transcript: "We decided to add weekend EVS coverage. Please post the schedule by Friday." },
          { id: `${ext}-no-transcript`, title: "Silent clip", created_at: "2026-08-10T10:00:00Z" },
        ],
      }),
    });

    expect(result).toMatchObject({ imported: 1, skippedExisting: 0, skippedNoTranscript: 1, total: 2 });
    const recording = await db.plaudRecording.findUnique({ where: { externalId: ext } });
    expect(recording).toBeTruthy();
    expect(recording!.title).toBe("Morning huddle at Mercy General");
    expect(recording!.analysisMode).toBe("AI"); // analyzed via the shared capability
    expect(recording!.recordedAt?.toISOString()).toBe("2026-08-10T09:00:00.000Z");

    const auditRow = await db.auditLog.findFirst({ where: { action: "PLAUD_SYNC", actorId: user.id }, orderBy: { createdAt: "desc" } });
    expect(auditRow).toBeTruthy();
    const notice = await db.notification.findFirst({ where: { userId: user.id, title: { contains: "Plaud sync complete" } } });
    expect(notice).toBeTruthy();
  });

  it("re-syncs are idempotent: already-imported recordings are skipped", async () => {
    process.env.PLAUD_API_KEY = "test-plaud-key";
    const user = await makeUser("ADMIN");
    const { orchestrator } = mockOrchestrator({ primaryResponder: () => MEETING_ANALYSIS_JSON });
    const ext = uniq("dupe");
    const payload = { data: [{ id: ext, title: "Repeat", transcript: "We decided things." }] };

    const first = await syncFromPlaud(db, orchestrator, { userId: user.id, fetchImpl: stubApi(payload) });
    const second = await syncFromPlaud(db, orchestrator, { userId: user.id, fetchImpl: stubApi(payload) });
    expect(first.imported).toBe(1);
    expect(second.imported).toBe(0);
    expect(second.skippedExisting).toBe(1);
    expect(await db.plaudRecording.count({ where: { externalId: ext } })).toBe(1);
  });

  it("maps tolerant field variants and bare-array payloads", async () => {
    process.env.PLAUD_API_KEY = "test-plaud-key";
    const user = await makeUser("ADMIN");
    const { orchestrator } = mockOrchestrator({ primaryResponder: () => MEETING_ANALYSIS_JSON });
    const ext = uniq("alt");
    const result = await syncFromPlaud(db, orchestrator, {
      userId: user.id,
      fetchImpl: stubApi([{ recording_id: ext, name: "Alt fields", start_time: "2026-08-11T08:00:00Z", transcription: "Please schedule the vendor walkthrough." }]),
    });
    expect(result.imported).toBe(1);
    const rec = await db.plaudRecording.findUnique({ where: { externalId: ext } });
    expect(rec!.title).toBe("Alt fields");
  });

  it("surfaces API failures without importing anything", async () => {
    process.env.PLAUD_API_KEY = "test-plaud-key";
    const user = await makeUser("ADMIN");
    const { orchestrator } = mockOrchestrator();
    const before = await db.plaudRecording.count();
    await expect(
      syncFromPlaud(db, orchestrator, { userId: user.id, fetchImpl: stubApi({ error: "nope" }, 503) }),
    ).rejects.toThrow(/HTTP 503/);
    expect(await db.plaudRecording.count()).toBe(before);
  });
});
