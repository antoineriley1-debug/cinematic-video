// Plaud Developer Platform client — implements the documented auth flow
// (docs.plaud.ai, Authentication API) exactly:
//   1. Partner Token:  POST {base}/developer/api/oauth/partner/access-token
//      with HTTP Basic base64(client_id:client_secret), form-encoded body.
//   2. User Token:     POST {base}/developer/api/open/partner/users/access-token
//      with Bearer <partner token>, JSON { user_id, expires_in }.
//   3. Transcription:  submit an audio file_url with the user token. The
//      exact transcription path is configurable via PLAUD_TRANSCRIBE_PATH
//      (Plaud's Transcription API reference page pins it; default below is
//      a best-effort guess) and the response parser is tolerant.
//
// Credentials come from portal.plaud.ai and stay server-side.
import type { Db } from "../db";

const DEFAULT_BASE = "https://platform-us.plaud.ai";
const DEFAULT_TRANSCRIBE_PATH = "/developer/api/open/partner/transcriptions";

export function plaudTranscriptionConfigured(): boolean {
  return Boolean(process.env.PLAUD_CLIENT_ID && process.env.PLAUD_CLIENT_SECRET);
}

function base(): string {
  return (process.env.PLAUD_PLATFORM_BASE || DEFAULT_BASE).replace(/\/$/, "");
}

type TokenState = { token: string; refreshToken?: string; expiresAt: number };
const store = globalThis as unknown as { __plaudPartnerToken?: TokenState | null };

/** Test hook: clear the cached partner token. */
export function __resetPlaudTokenCache(): void {
  store.__plaudPartnerToken = null;
}

async function fetchPartnerToken(doFetch: typeof fetch): Promise<TokenState> {
  const basic = Buffer.from(`${process.env.PLAUD_CLIENT_ID}:${process.env.PLAUD_CLIENT_SECRET}`).toString("base64");
  const res = await doFetch(`${base()}/developer/api/oauth/partner/access-token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "",
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Plaud partner-token request failed: HTTP ${res.status}`);
  const data = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("Plaud partner-token response missing access_token");
  return {
    token: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + Math.max((data.expires_in ?? 3600) - 60, 60) * 1000,
  };
}

export async function getPartnerToken(doFetch: typeof fetch = fetch): Promise<string> {
  if (!plaudTranscriptionConfigured()) throw new Error("Plaud is not configured (PLAUD_CLIENT_ID / PLAUD_CLIENT_SECRET).");
  const cached = store.__plaudPartnerToken;
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const fresh = await fetchPartnerToken(doFetch);
  store.__plaudPartnerToken = fresh;
  return fresh.token;
}

export async function getUserToken(userId: string, doFetch: typeof fetch = fetch): Promise<string> {
  const partnerToken = await getPartnerToken(doFetch);
  // Plaud requires a stable 6–120 char user id.
  const stableId = `ceos-${userId}`.slice(0, 120).padEnd(6, "0");
  const res = await doFetch(`${base()}/developer/api/open/partner/users/access-token`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${partnerToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ user_id: stableId, expires_in: 86400 }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Plaud user-token request failed: HTTP ${res.status}`);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Plaud user-token response missing access_token");
  return data.access_token;
}

export type PlaudTranscriptionResult =
  | { status: "completed"; transcript: string }
  | { status: "pending"; raw: unknown };

function extractTranscript(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  for (const key of ["transcript", "text", "content", "markdown"]) {
    if (typeof obj[key] === "string" && (obj[key] as string).trim()) return obj[key] as string;
  }
  const nested = obj.result ?? obj.data;
  if (nested && typeof nested === "object") {
    const inner = extractTranscript(nested);
    if (inner) return inner;
  }
  const segments = obj.segments ?? obj.sentences ?? obj.utterances;
  if (Array.isArray(segments) && segments.length > 0) {
    const lines = segments
      .map((s) => {
        if (typeof s === "string") return s;
        if (s && typeof s === "object") {
          const seg = s as Record<string, unknown>;
          const speaker = typeof seg.speaker === "string" || typeof seg.speaker === "number" ? `Speaker ${seg.speaker}: ` : "";
          const text = typeof seg.text === "string" ? seg.text : typeof seg.content === "string" ? seg.content : "";
          return text ? `${speaker}${text}` : "";
        }
        return "";
      })
      .filter(Boolean);
    if (lines.length) return lines.join("\n");
  }
  return null;
}

/**
 * Submit a publicly fetchable audio file_url for transcription on behalf of
 * an executive. Returns the transcript when Plaud responds synchronously, or
 * a pending marker when the API queues a job.
 */
export async function transcribeFileUrl(
  opts: { fileUrl: string; userId: string; fetchImpl?: typeof fetch },
): Promise<PlaudTranscriptionResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const userToken = await getUserToken(opts.userId, doFetch);
  const path = process.env.PLAUD_TRANSCRIBE_PATH || DEFAULT_TRANSCRIBE_PATH;
  const res = await doFetch(`${base()}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${userToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ file_url: opts.fileUrl }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`Plaud transcription request failed: HTTP ${res.status}`);
  const payload = (await res.json()) as unknown;
  const transcript = extractTranscript(payload);
  if (transcript) return { status: "completed", transcript };
  return { status: "pending", raw: payload };
}

/** Audit-friendly summary of current Plaud config for the admin console. */
export function plaudConfigSummary(): { configured: boolean; base: string; transcribePath: string } {
  return {
    configured: plaudTranscriptionConfigured(),
    base: base(),
    transcribePath: process.env.PLAUD_TRANSCRIBE_PATH || DEFAULT_TRANSCRIBE_PATH,
  };
}

export type { Db };
