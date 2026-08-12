import { describe, it, expect } from "vitest";
import { db, makeUser, mockOrchestrator, uniq, MEETING_ANALYSIS_JSON } from "./helpers";
import { importPlaudAudio, attachPlaudTranscript } from "@/lib/services/plaud";

describe("Plaud audio upload (drag & drop path)", () => {
  it("stores the audio content-addressed, creates a playable recording, audits, and records activity", async () => {
    const user = await makeUser();
    const title = uniq("Site walk audio");
    const { recordingId, fileId } = await importPlaudAudio(db, {
      title,
      buffer: Buffer.from("FAKE-AUDIO-BYTES-" + title),
      filename: "site-walk.m4a",
      mimeType: "audio/mp4",
      uploadedById: user.id,
    });

    const recording = await db.plaudRecording.findUniqueOrThrow({ where: { id: recordingId } });
    expect(recording.fileId).toBe(fileId);
    expect(recording.transcript).toBe(""); // analysis waits for a transcript
    expect(recording.analysisMode).toBeNull();

    const file = await db.storedFile.findUniqueOrThrow({ where: { id: fileId } });
    expect(file.mimeType).toBe("audio/mp4");
    expect(file.entityType).toBe("PLAUD");
    expect(file.entityId).toBe(recordingId);
    expect(file.sha256).toHaveLength(64);

    expect(await db.auditLog.count({ where: { action: "PLAUD_AUDIO_UPLOADED", entityId: recordingId } })).toBe(1);
    expect(await db.activityEvent.count({ where: { userId: user.id, entityId: recordingId } })).toBe(1);
  });

  it("rejects non-audio disguised uploads via the storage validator", async () => {
    const user = await makeUser();
    await expect(
      importPlaudAudio(db, {
        title: "bad",
        buffer: Buffer.from("x"),
        filename: "../../etc/passwd",
        mimeType: "audio/mpeg",
        uploadedById: user.id,
      }),
    ).rejects.toThrow(/Invalid filename/);
  });

  it("attach transcript → analysis runs and recording becomes searchable intelligence", async () => {
    const user = await makeUser();
    const { orchestrator } = mockOrchestrator({ primaryResponder: () => MEETING_ANALYSIS_JSON });
    const { recordingId } = await importPlaudAudio(db, {
      title: uniq("Huddle"),
      buffer: Buffer.from("AUDIO-" + uniq("h")),
      filename: "huddle.mp3",
      mimeType: "audio/mpeg",
      uploadedById: user.id,
    });

    const { mode } = await attachPlaudTranscript(db, orchestrator, {
      recordingId,
      transcript: "We decided to add weekend EVS coverage. Please post the schedule by Friday.",
      userId: user.id,
    });
    expect(mode).toBe("AI");

    const recording = await db.plaudRecording.findUniqueOrThrow({ where: { id: recordingId } });
    expect(recording.transcript).toContain("weekend EVS coverage");
    expect(recording.analysisMode).toBe("AI");
    expect(recording.summary).toBeTruthy();
    expect(await db.auditLog.count({ where: { action: "PLAUD_TRANSCRIPT_ATTACHED", entityId: recordingId } })).toBe(1);
  });

  it("identical audio uploaded twice shares one stored object (dedupe), with separate recordings", async () => {
    const user = await makeUser();
    const bytes = Buffer.from("SAME-AUDIO-" + uniq("d"));
    const a = await importPlaudAudio(db, { title: "copy A", buffer: bytes, filename: "a.mp3", mimeType: "audio/mpeg", uploadedById: user.id });
    const b = await importPlaudAudio(db, { title: "copy B", buffer: bytes, filename: "b.mp3", mimeType: "audio/mpeg", uploadedById: user.id });
    expect(a.recordingId).not.toBe(b.recordingId);
    const fileA = await db.storedFile.findUniqueOrThrow({ where: { id: a.fileId } });
    const fileB = await db.storedFile.findUniqueOrThrow({ where: { id: b.fileId } });
    expect(fileA.sha256).toBe(fileB.sha256);
    expect(fileA.path).toBe(fileB.path); // one blob on disk, two references
  });
});
