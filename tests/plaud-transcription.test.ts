import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db, makeUser, mockOrchestrator, uniq, MEETING_ANALYSIS_JSON } from "./helpers";
import {
  plaudTranscriptionConfigured,
  getPartnerToken,
  getUserToken,
  transcribeFileUrl,
  __resetPlaudTokenCache,
} from "@/lib/services/plaudClient";
import { importPlaudAudio, transcribeWithPlaud } from "@/lib/services/plaud";
import { makeSignedFilePath, verifySignedFile } from "@/lib/signedUrl";
import { GET as publicFileGet } from "@/app/api/public-files/[id]/route";
import { NextRequest } from "next/server";

const ENV = ["PLAUD_CLIENT_ID", "PLAUD_CLIENT_SECRET", "PLAUD_PLATFORM_BASE", "PLAUD_TRANSCRIBE_PATH", "APP_BASE_URL"];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
beforeEach(() => {
  __resetPlaudTokenCache();
  process.env.PLAUD_CLIENT_ID = "test-client-id";
  process.env.PLAUD_CLIENT_SECRET = "test-client-secret";
  delete process.env.PLAUD_PLATFORM_BASE;
  delete process.env.PLAUD_TRANSCRIBE_PATH;
  process.env.APP_BASE_URL = "https://ceos.example.com";
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  __resetPlaudTokenCache();
});

type Call = { url: string; init: RequestInit };
function stubPlaud(responses: Record<string, unknown>, calls: Call[] = []) {
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    for (const [needle, body] of Object.entries(responses)) {
      if (url.includes(needle)) {
        return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
      }
    }
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe("Plaud auth flow (exact per docs.plaud.ai)", () => {
  it("is unconfigured without both client credentials", async () => {
    delete process.env.PLAUD_CLIENT_ID;
    expect(plaudTranscriptionConfigured()).toBe(false);
    await expect(getPartnerToken()).rejects.toThrow(/not configured/);
  });

  it("exchanges Basic base64(client_id:secret) for a partner token at the documented endpoint", async () => {
    const { fn, calls } = stubPlaud({
      "/developer/api/oauth/partner/access-token": { access_token: "partner-tok", refresh_token: "r", token_type: "bearer", expires_in: 3600 },
    });
    const token = await getPartnerToken(fn);
    expect(token).toBe("partner-tok");
    const call = calls[0];
    expect(call.url).toBe("https://platform-us.plaud.ai/developer/api/oauth/partner/access-token");
    const headers = call.init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Basic ${Buffer.from("test-client-id:test-client-secret").toString("base64")}`);
    expect(headers["content-type"]).toBe("application/x-www-form-urlencoded");
  });

  it("caches the partner token until near expiry", async () => {
    const { fn, calls } = stubPlaud({
      "oauth/partner/access-token": { access_token: "partner-tok", expires_in: 3600 },
    });
    await getPartnerToken(fn);
    await getPartnerToken(fn);
    expect(calls.length).toBe(1); // second call served from cache
  });

  it("mints a user token with Bearer partner auth and a 6-120 char stable user_id", async () => {
    const { fn, calls } = stubPlaud({
      "oauth/partner/access-token": { access_token: "partner-tok", expires_in: 3600 },
      "open/partner/users/access-token": { access_token: "user-tok", token_type: "bearer", expires_in: 86400 },
    });
    const token = await getUserToken("u1", fn);
    expect(token).toBe("user-tok");
    const userCall = calls.find((c) => c.url.includes("users/access-token"))!;
    expect((userCall.init.headers as Record<string, string>).authorization).toBe("Bearer partner-tok");
    const body = JSON.parse(String(userCall.init.body)) as { user_id: string; expires_in: number };
    expect(body.user_id.length).toBeGreaterThanOrEqual(6);
    expect(body.user_id.length).toBeLessThanOrEqual(120);
    expect(body.user_id).toContain("u1");
  });

  it("surfaces auth failures with the HTTP status", async () => {
    const fn = (async () => new Response("denied", { status: 401 })) as unknown as typeof fetch;
    await expect(getPartnerToken(fn)).rejects.toThrow(/HTTP 401/);
  });
});

describe("Plaud transcription submission", () => {
  it("submits the file_url with the user token and extracts a direct transcript", async () => {
    const { fn, calls } = stubPlaud({
      "oauth/partner/access-token": { access_token: "partner-tok", expires_in: 3600 },
      "users/access-token": { access_token: "user-tok", expires_in: 86400 },
      "/developer/api/open/partner/transcriptions": { transcript: "Speaker 1: We decided to fix the chiller." },
    });
    const result = await transcribeFileUrl({ fileUrl: "https://ceos.example.com/api/public-files/f1?exp=1&sig=2", userId: "u1", fetchImpl: fn });
    expect(result.status).toBe("completed");
    if (result.status === "completed") expect(result.transcript).toContain("chiller");
    const submit = calls.find((c) => c.url.includes("transcriptions"))!;
    expect((submit.init.headers as Record<string, string>).authorization).toBe("Bearer user-tok");
    expect(JSON.parse(String(submit.init.body)).file_url).toContain("/api/public-files/f1");
  });

  it("joins speaker-attributed segments into a transcript", async () => {
    const { fn } = stubPlaud({
      "oauth/partner/access-token": { access_token: "p", expires_in: 3600 },
      "users/access-token": { access_token: "u", expires_in: 86400 },
      transcriptions: { result: { segments: [{ speaker: 1, text: "Hello team." }, { speaker: 2, text: "The boiler failed." }] } },
    });
    const result = await transcribeFileUrl({ fileUrl: "https://x/f", userId: "u1", fetchImpl: fn });
    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.transcript).toContain("Speaker 1: Hello team.");
      expect(result.transcript).toContain("Speaker 2: The boiler failed.");
    }
  });

  it("returns pending when Plaud queues a job instead of answering inline", async () => {
    const { fn } = stubPlaud({
      "oauth/partner/access-token": { access_token: "p", expires_in: 3600 },
      "users/access-token": { access_token: "u", expires_in: 86400 },
      transcriptions: { task_id: "t-1", status: "processing" },
    });
    const result = await transcribeFileUrl({ fileUrl: "https://x/f", userId: "u1", fetchImpl: fn });
    expect(result.status).toBe("pending");
  });
});

describe("end-to-end: audio upload → Plaud transcription → analysis", () => {
  it("fills the transcript and runs analysis when Plaud completes synchronously", async () => {
    const user = await makeUser();
    const { orchestrator } = mockOrchestrator({ primaryResponder: () => MEETING_ANALYSIS_JSON });
    const { recordingId } = await importPlaudAudio(db, {
      title: uniq("Auto-transcribe"),
      buffer: Buffer.from("AUDIO-" + uniq("t")),
      filename: "walk.mp3",
      mimeType: "audio/mpeg",
      uploadedById: user.id,
    });

    const { fn, calls } = stubPlaud({
      "oauth/partner/access-token": { access_token: "p", expires_in: 3600 },
      "users/access-token": { access_token: "u", expires_in: 86400 },
      transcriptions: { transcript: "We decided to add weekend coverage. Please post the schedule." },
    });
    const result = await transcribeWithPlaud(db, orchestrator, { recordingId, userId: user.id, fetchImpl: fn });
    expect(result.status).toBe("completed");

    const recording = await db.plaudRecording.findUniqueOrThrow({ where: { id: recordingId } });
    expect(recording.transcript).toContain("weekend coverage");
    expect(recording.analysisMode).toBe("AI");

    // The submitted file_url is a signed public URL on our app.
    const submit = calls.find((c) => c.url.includes("transcriptions"))!;
    const fileUrl = JSON.parse(String(submit.init.body)).file_url as string;
    expect(fileUrl.startsWith("https://ceos.example.com/api/public-files/")).toBe(true);
    expect(fileUrl).toContain("sig=");

    expect(await db.auditLog.count({ where: { action: "PLAUD_TRANSCRIPTION_REQUESTED", entityId: recordingId } })).toBe(1);
  });

  it("refuses without APP_BASE_URL and without credentials", async () => {
    const user = await makeUser();
    const { orchestrator } = mockOrchestrator();
    const { recordingId } = await importPlaudAudio(db, {
      title: uniq("nourl"), buffer: Buffer.from("A"), filename: "a.mp3", mimeType: "audio/mpeg", uploadedById: user.id,
    });
    delete process.env.APP_BASE_URL;
    await expect(transcribeWithPlaud(db, orchestrator, { recordingId, userId: user.id })).rejects.toThrow(/APP_BASE_URL/);
    delete process.env.PLAUD_CLIENT_ID;
    await expect(transcribeWithPlaud(db, orchestrator, { recordingId, userId: user.id })).rejects.toThrow(/not configured/);
  });
});

describe("signed public file URLs", () => {
  it("round-trips a valid signature and rejects tampering and expiry", () => {
    const path = makeSignedFilePath("file-123", 60000);
    const url = new URL("https://x" + path);
    const exp = url.searchParams.get("exp");
    const sig = url.searchParams.get("sig");
    expect(verifySignedFile("file-123", exp, sig)).toBe(true);
    expect(verifySignedFile("other-file", exp, sig)).toBe(false);
    expect(verifySignedFile("file-123", String(Date.now() - 1000), sig)).toBe(false);
    expect(verifySignedFile("file-123", exp, "0".repeat((sig ?? "").length))).toBe(false);
  });

  it("serves a real stored file through the route with a valid signature only", async () => {
    const user = await makeUser();
    const { recordingId, fileId } = await importPlaudAudio(db, {
      title: uniq("served"), buffer: Buffer.from("AUDIO-BYTES-" + uniq("s")), filename: "s.mp3", mimeType: "audio/mpeg", uploadedById: user.id,
    });
    void recordingId;
    const path = makeSignedFilePath(fileId);
    const ok = await publicFileGet(new NextRequest(`https://x${path}`), { params: Promise.resolve({ id: fileId }) });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("audio/mpeg");

    const bad = await publicFileGet(new NextRequest(`https://x/api/public-files/${fileId}?exp=1&sig=bad`), {
      params: Promise.resolve({ id: fileId }),
    });
    expect(bad.status).toBe(403);
  });
});
