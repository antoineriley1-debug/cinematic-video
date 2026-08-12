// Plaud integration. Plaud is the designated recording source — there is no
// redundant in-app recording subsystem. Supported paths: audio file upload
// (drag & drop), transcript import, and — deferred by user decision — direct
// API sync (dormant adapter in plaudSync.ts, re-enable when wanted).
import type { Db } from "../db";
import { audit } from "../audit";
import { recordActivity } from "../activity";
import { storeFile } from "../storage";
import type { Orchestrator } from "../ai/orchestrator";
import { analyzeMeeting } from "../ai/capabilities";

export async function importPlaudRecording(
  db: Db,
  orchestrator: Orchestrator,
  opts: { title: string; recordedAt?: Date; transcript: string; fileId?: string; uploadedById: string; externalId?: string },
) {
  const recording = await db.plaudRecording.create({
    data: {
      title: opts.title,
      recordedAt: opts.recordedAt ?? null,
      transcript: opts.transcript,
      fileId: opts.fileId ?? null,
      uploadedById: opts.uploadedById,
      externalId: opts.externalId ?? null,
    },
  });
  // Transcript analysis shares the meeting-analysis capability shape.
  const analysis = await analyzeMeeting(db, orchestrator, opts.transcript, { userId: opts.uploadedById });
  await db.plaudRecording.update({
    where: { id: recording.id },
    data: {
      summary: analysis.summary,
      decisionsJson: JSON.stringify(analysis.decisions),
      actionsJson: JSON.stringify(analysis.actions),
      analysisMode: analysis.mode,
    },
  });
  await audit(db, { actorId: opts.uploadedById, action: "PLAUD_IMPORTED", entityType: "PLAUD", entityId: recording.id, after: { title: opts.title } });
  await recordActivity(db, {
    userId: opts.uploadedById,
    type: "PLAUD_IMPORTED",
    summary: `Plaud recording imported: ${opts.title}`,
    entityType: "PLAUD",
    entityId: recording.id,
    occurredAt: opts.recordedAt ?? undefined,
  });
  return { recordingId: recording.id, mode: analysis.mode };
}

/**
 * Audio-file upload path (drag & drop from the Plaud app's exports). The
 * audio is stored content-addressed and playable in-app; analysis unlocks
 * once a transcript is attached.
 */
export async function importPlaudAudio(
  db: Db,
  opts: {
    title: string;
    recordedAt?: Date;
    buffer: Buffer;
    filename: string;
    mimeType: string;
    uploadedById: string;
    maxBytes?: number;
  },
) {
  const recording = await db.plaudRecording.create({
    data: {
      title: opts.title,
      recordedAt: opts.recordedAt ?? null,
      transcript: "",
      uploadedById: opts.uploadedById,
    },
  });
  const file = await storeFile(db, {
    buffer: opts.buffer,
    filename: opts.filename,
    mimeType: opts.mimeType || "audio/mpeg",
    ownerId: opts.uploadedById,
    entityType: "PLAUD",
    entityId: recording.id,
    maxBytes: opts.maxBytes,
  });
  await db.plaudRecording.update({ where: { id: recording.id }, data: { fileId: file.id } });
  await audit(db, { actorId: opts.uploadedById, action: "PLAUD_AUDIO_UPLOADED", entityType: "PLAUD", entityId: recording.id, after: { filename: opts.filename, size: opts.buffer.length } });
  await recordActivity(db, {
    userId: opts.uploadedById,
    type: "PLAUD_IMPORTED",
    summary: `Plaud audio uploaded: ${opts.title}`,
    entityType: "PLAUD",
    entityId: recording.id,
    occurredAt: opts.recordedAt ?? undefined,
  });
  return { recordingId: recording.id, fileId: file.id };
}

/** Attach (or replace) a transcript on an existing recording and analyze it. */
export async function attachPlaudTranscript(
  db: Db,
  orchestrator: Orchestrator,
  opts: { recordingId: string; transcript: string; userId: string },
) {
  const recording = await db.plaudRecording.findUniqueOrThrow({ where: { id: opts.recordingId } });
  const analysis = await analyzeMeeting(db, orchestrator, opts.transcript, { userId: opts.userId });
  await db.plaudRecording.update({
    where: { id: recording.id },
    data: {
      transcript: opts.transcript,
      summary: analysis.summary,
      decisionsJson: JSON.stringify(analysis.decisions),
      actionsJson: JSON.stringify(analysis.actions),
      analysisMode: analysis.mode,
    },
  });
  await audit(db, { actorId: opts.userId, action: "PLAUD_TRANSCRIPT_ATTACHED", entityType: "PLAUD", entityId: recording.id, after: { mode: analysis.mode, length: opts.transcript.length } });
  await recordActivity(db, {
    userId: opts.userId,
    type: "PLAUD_IMPORTED",
    summary: `Transcript attached and analyzed: ${recording.title}`,
    entityType: "PLAUD",
    entityId: recording.id,
  });
  return { mode: analysis.mode };
}
