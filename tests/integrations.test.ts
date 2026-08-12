import { describe, it, expect, afterEach, vi } from "vitest";
import type { Transporter } from "nodemailer";
import { db, makeUser, uniq } from "./helpers";
import { __setTransportForTests, mailEnabled, sendNotificationEmail } from "@/lib/mailer";
import { notify } from "@/lib/notify";
import { voiceConfigured, synthesizeSpeech } from "@/lib/voice";
import { narrationTextFor, TRAINING_MODULES } from "@/lib/training";
import { POST as intakePost } from "@/app/api/intake/email/route";
import { NextRequest } from "next/server";

const ENV_KEYS = ["EMAIL_INTAKE_TOKEN", "EMAIL_INTAKE_DEFAULT_OWNER", "VOICE_PROVIDER", "VOICE_API_KEY", "SMTP_HOST", "SMTP_FROM"];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  __setTransportForTests(null);
});

// ---------- SMTP notification delivery ----------

describe("SMTP email notifications", () => {
  it("is disabled without SMTP configuration", async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_FROM;
    expect(mailEnabled()).toBe(false);
    const sent = await sendNotificationEmail(db, { to: "x@y.z", title: "t" });
    expect(sent).toBe(false);
  });

  it("sends an email copy for MENTION notifications and skips MESSAGE ones", async () => {
    const sendMail = vi.fn(async () => ({ messageId: "test" }));
    __setTransportForTests({ sendMail } as unknown as Transporter);
    const user = await makeUser();

    await notify(db, { userId: user.id, type: "MENTION", title: "Antoine mentioned you", body: "on a note" });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0] as { to: string; subject: string; text: string };
    expect(mail.to).toBe(user.email);
    expect(mail.subject).toContain("Antoine mentioned you");

    await notify(db, { userId: user.id, type: "MESSAGE", title: "New message" });
    expect(sendMail).toHaveBeenCalledTimes(1); // messages stay in-app only

    // In-app notifications exist regardless.
    expect(await db.notification.count({ where: { userId: user.id } })).toBe(2);
  });

  it("mail failure never breaks the in-app notification", async () => {
    const sendMail = vi.fn(async () => {
      throw new Error("smtp down");
    });
    __setTransportForTests({ sendMail } as unknown as Transporter);
    const user = await makeUser();
    const n = await notify(db, { userId: user.id, type: "ALERT", title: "Threshold exceeded" });
    expect(n.id).toBeTruthy();
    const events = await db.providerEvent.findMany({ where: { provider: "smtp" } });
    expect(events.length).toBeGreaterThan(0);
  });
});

// ---------- Method B inbound intake ----------

function intakeRequest(body: string, token?: string): NextRequest {
  return new NextRequest("http://localhost/api/intake/email", {
    method: "POST",
    headers: { "content-type": "message/rfc822", ...(token ? { "x-intake-token": token } : {}) },
    body,
  });
}

describe("Method B email intake endpoint", () => {
  const eml = (marker: string, from = "unknown@example.com") =>
    `From: ${from}\nTo: intake@executive-os.local\nSubject: Forwarded vendor issue ${marker}\nDate: Wed, 12 Aug 2026 09:00:00 -0500\nContent-Type: text/plain\n\nForwarded for the record: vendor missed the service window ${marker}.`;

  it("is disabled (503) until EMAIL_INTAKE_TOKEN is configured", async () => {
    delete process.env.EMAIL_INTAKE_TOKEN;
    const res = await intakePost(intakeRequest(eml(uniq("x"))));
    expect(res.status).toBe(503);
  });

  it("rejects wrong tokens and empty bodies", async () => {
    process.env.EMAIL_INTAKE_TOKEN = "intake-secret-token";
    expect((await intakePost(intakeRequest(eml(uniq("x")), "wrong-token-value"))).status).toBe(401);
    expect((await intakePost(intakeRequest("", "intake-secret-token"))).status).toBe(400);
  });

  it("ingests forwarded mail, attributes it to the matching executive, and dedupes", async () => {
    process.env.EMAIL_INTAKE_TOKEN = "intake-secret-token";
    const owner = await makeUser("EXECUTIVE", "Intake Owner");
    const marker = uniq("intake");
    const raw = eml(marker, owner.email);

    const first = await intakePost(intakeRequest(raw, "intake-secret-token"));
    expect(first.status).toBe(201);
    const body = (await first.json()) as { emailId: string; duplicate: boolean };
    expect(body.duplicate).toBe(false);

    const email = await db.emailMessage.findUniqueOrThrow({ where: { id: body.emailId } });
    expect(email.uploadedById).toBe(owner.id);
    expect(email.rawSource).toBe(raw);
    expect(email.analysisStatus).toBe("ANALYZED"); // full pipeline ran

    const second = await intakePost(intakeRequest(raw, "intake-secret-token"));
    expect(second.status).toBe(200);
    expect(((await second.json()) as { duplicate: boolean }).duplicate).toBe(true);
  });

  it("falls back to the configured default owner for unknown senders", async () => {
    process.env.EMAIL_INTAKE_TOKEN = "intake-secret-token";
    const fallback = await makeUser("EXECUTIVE", "Fallback Owner");
    process.env.EMAIL_INTAKE_DEFAULT_OWNER = fallback.email;
    const res = await intakePost(intakeRequest(eml(uniq("fb"), "stranger@outside.org"), "intake-secret-token"));
    const body = (await res.json()) as { emailId: string };
    const email = await db.emailMessage.findUniqueOrThrow({ where: { id: body.emailId } });
    expect(email.uploadedById).toBe(fallback.id);
  });
});

// ---------- Voice provider abstraction ----------

describe("voice provider", () => {
  it("reports unconfigured and refuses synthesis without credentials", async () => {
    delete process.env.VOICE_PROVIDER;
    delete process.env.VOICE_API_KEY;
    expect(voiceConfigured()).toBe(false);
    await expect(synthesizeSpeech({ text: "hi" })).rejects.toThrow(/No voice provider/);
  });

  it("calls ElevenLabs with server-side credentials and returns audio", async () => {
    process.env.VOICE_PROVIDER = "elevenlabs";
    process.env.VOICE_API_KEY = "voice-test-key";
    const audio = new Uint8Array([1, 2, 3, 4]);
    const fetchMock = vi.fn(async () => new Response(audio, { status: 200 }));
    const result = await synthesizeSpeech({ text: "Welcome to Crothall Executive OS." }, fetchMock as unknown as typeof fetch);
    expect(result.mimeType).toBe("audio/mpeg");
    expect(result.audio.length).toBe(4);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("api.elevenlabs.io/v1/text-to-speech/");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("voice-test-key");
  });

  it("maps provider errors and rejects unknown providers", async () => {
    process.env.VOICE_PROVIDER = "elevenlabs";
    process.env.VOICE_API_KEY = "voice-test-key";
    const fetchMock = vi.fn(async () => new Response("no", { status: 401 }));
    await expect(synthesizeSpeech({ text: "x" }, fetchMock as unknown as typeof fetch)).rejects.toThrow(/HTTP 401/);
    process.env.VOICE_PROVIDER = "unknownvendor";
    await expect(synthesizeSpeech({ text: "x" })).rejects.toThrow(/Unknown VOICE_PROVIDER/);
  });

  it("has narration text for the welcome presentation and every training module", () => {
    expect(narrationTextFor("welcome")).toContain("I'm here to help you");
    for (const m of TRAINING_MODULES) {
      expect(narrationTextFor(m.slug)).toContain(m.title);
    }
    expect(narrationTextFor("nonexistent")).toBeNull();
  });
});
