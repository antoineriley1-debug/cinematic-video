// Plaud API sync adapter. Pulls recordings from the Plaud developer API and
// imports them through the same pipeline as manual imports (analysis,
// activity, audit — and the same human-confirmation rules for anything
// sensitive). Already-synced recordings are skipped by external id.
//
// The base URL and paths are configurable because Plaud's API surface could
// not be confirmed from this build environment (egress-blocked): adjust
// PLAUD_API_BASE / PLAUD_API_LIST_PATH via env if the deployed schema
// differs. Field mapping below is deliberately tolerant.
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
