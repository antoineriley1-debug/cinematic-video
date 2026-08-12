// Plaud integration. Plaud is the designated recording source — there is no
// redundant in-app recording subsystem. Supported paths: manual file/transcript
// import (implemented) and Plaud API sync (adapter stub pending credentials —
// see docs/REQUIREMENTS_TRACEABILITY.md BLOCKED_EXTERNAL items).
import type { Db } from "../db";
import { audit } from "../audit";
import { recordActivity } from "../activity";
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
