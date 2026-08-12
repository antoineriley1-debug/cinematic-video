// DORMANT — Plaud integration deferred by user decision (2026-08-12).
//
// Per Plaud's official developer docs (docs.plaud.ai, reviewed 2026-08-12),
// the real "Plaud Embedded" architecture differs from this adapter's
// original list-and-poll guess:
//   1. Recordings live on the DEVICE and sync to a MOBILE app via the
//      Embedded SDK (BLE/WiFi) — there is no cloud "list recordings" API
//      for third parties. Device binding requires a mobile app.
//   2. The server-side piece is the TRANSCRIPTION API: exchange client_id +
//      client_secret (from portal.plaud.ai) for a Partner Token at
//      POST https://platform-us.plaud.ai/developer/api/oauth/partner/access-token
//      (HTTP Basic base64(client_id:secret)), mint per-user tokens at
//      POST .../developer/api/open/partner/users/access-token, then submit
//      an uploaded audio file's URL for speaker-attributed transcription.
//
// The right future integration for this web app: auto-transcribe the audio
// files users already drag-and-drop into /plaud by calling the
// Transcription API, filling PlaudRecording.transcript automatically
// (today the user attaches the transcript manually). Requirements to build:
// client_id + client_secret, the Transcription API endpoint spec page, and
// egress/production access to platform-us.plaud.ai.
//
// The generic list-sync below is retained only as scaffolding; do not
// enable it against Plaud — replace with the flow described above.
import type { Db } from "../db";
import { audit } from "../audit";
import { notify } from "../notify";
import type { Orchestrator } from "../ai/orchestrator";
import { importPlaudRecording } from "./plaud";

type PlaudApiRecording = {
  id?: string | number;
  recording_id?: string | number;
  title?: string;
  name?: string;
  created_at?: string;
  createdAt?: string;
  start_time?: string;
  recorded_at?: string;
  transcript?: string;
  transcription?: string;
  text?: string;
  content?: string;
};

export type PlaudSyncResult = {
  imported: number;
  skippedExisting: number;
  skippedNoTranscript: number;
  total: number;
};

export function plaudConfigured(): boolean {
  return Boolean(process.env.PLAUD_API_KEY);
}

function extractList(payload: unknown): PlaudApiRecording[] {
  if (Array.isArray(payload)) return payload as PlaudApiRecording[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    for (const key of ["recordings", "data", "items", "results"]) {
      if (Array.isArray(obj[key])) return obj[key] as PlaudApiRecording[];
    }
  }
  return [];
}

function mapRecording(raw: PlaudApiRecording) {
  const externalId = String(raw.id ?? raw.recording_id ?? "");
  const transcript = raw.transcript ?? raw.transcription ?? raw.text ?? raw.content ?? "";
  const dateRaw = raw.recorded_at ?? raw.start_time ?? raw.created_at ?? raw.createdAt;
  const recordedAt = dateRaw ? new Date(dateRaw) : undefined;
  return {
    externalId,
    title: raw.title ?? raw.name ?? (externalId ? `Plaud recording ${externalId}` : "Plaud recording"),
    transcript,
    recordedAt: recordedAt && !isNaN(recordedAt.getTime()) ? recordedAt : undefined,
  };
}

export async function syncFromPlaud(
  db: Db,
  orchestrator: Orchestrator,
  opts: { userId: string; limit?: number; fetchImpl?: typeof fetch },
): Promise<PlaudSyncResult> {
  const key = process.env.PLAUD_API_KEY;
  if (!key) throw new Error("PLAUD_API_KEY is not configured.");
  const base = (process.env.PLAUD_API_BASE || "https://api.plaud.ai/v1").replace(/\/$/, "");
  const listPath = process.env.PLAUD_API_LIST_PATH || "/recordings";
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const doFetch = opts.fetchImpl ?? fetch;

  const res = await doFetch(`${base}${listPath}?limit=${limit}`, {
    headers: { authorization: `Bearer ${key}`, accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Plaud API returned HTTP ${res.status}.`);
  const items = extractList(await res.json());

  const result: PlaudSyncResult = { imported: 0, skippedExisting: 0, skippedNoTranscript: 0, total: items.length };
  for (const raw of items) {
    const mapped = mapRecording(raw);
    if (!mapped.externalId) continue;
    const existing = await db.plaudRecording.findUnique({ where: { externalId: mapped.externalId } });
    if (existing) {
      result.skippedExisting++;
      continue;
    }
    if (!mapped.transcript.trim()) {
      result.skippedNoTranscript++;
      continue;
    }
    await importPlaudRecording(db, orchestrator, {
      title: mapped.title,
      recordedAt: mapped.recordedAt,
      transcript: mapped.transcript,
      uploadedById: opts.userId,
      externalId: mapped.externalId,
    });
    result.imported++;
  }

  await audit(db, {
    actorId: opts.userId,
    action: "PLAUD_SYNC",
    entityType: "PLAUD",
    entityId: "sync",
    after: result,
    source: "API",
  });
  await notify(db, {
    userId: opts.userId,
    type: "SYSTEM",
    title: `Plaud sync complete: ${result.imported} imported`,
    body: `${result.total} recordings listed · ${result.skippedExisting} already imported · ${result.skippedNoTranscript} without transcripts.`,
  });
  return result;
}
