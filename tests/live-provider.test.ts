// LIVE PROVIDER DRILL — runs only when ANTHROPIC_API_KEY is available
// (loaded from .env; never committed). Skipped entirely in CI.
//
// Covers the release-gate "AI failure test" against the REAL provider:
// - the key authenticates and the API is reachable
// - health probe reflects true usability (billing-exhausted key = unhealthy)
// - a real provider failure degrades to Emergency Intelligence Mode with
//   queueing and admin alerts — no data loss, honest labeling
// - when the account has usable credits, live AI-quality checks run too.
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { db, makeUser, makeSite, uniq } from "./helpers";
import { Orchestrator } from "@/lib/ai/orchestrator";
import { AnthropicProvider } from "@/lib/ai/providers/anthropic";
import { OpenAiProvider } from "@/lib/ai/providers/openai";
import { ingestEmail } from "@/lib/services/emails";
import { drainAiQueue } from "@/lib/services/aiQueue";

// Load ANTHROPIC_API_KEY from .env without disturbing test DB settings.
const envPath = path.resolve(__dirname, "..", ".env");
if (!process.env.ANTHROPIC_API_KEY && fs.existsSync(envPath)) {
  const match = fs.readFileSync(envPath, "utf8").match(/^ANTHROPIC_API_KEY="?([^"\n]+)"?$/m);
  if (match?.[1]) process.env.ANTHROPIC_API_KEY = match[1];
}
const HAS_KEY = Boolean(process.env.ANTHROPIC_API_KEY);

async function probeAccount(): Promise<{ reachable: boolean; authenticated: boolean; usable: boolean; detail: string }> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
        max_tokens: 8,
        messages: [{ role: "user", content: "Say OK" }],
      }),
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.text();
    return {
      reachable: true,
      authenticated: res.status !== 401 && res.status !== 403,
      usable: res.ok,
      detail: res.ok ? "ok" : body.slice(0, 200),
    };
  } catch (err) {
    return { reachable: false, authenticated: false, usable: false, detail: String(err) };
  }
}

// Probe once up front: a revoked or rotated key is an external condition,
// not a code defect, so the drill reports it loudly and skips rather than
// failing the suite. Only a key that actually authenticates can exercise
// the live paths this drill exists to prove.
const ACCOUNT = HAS_KEY ? await probeAccount() : null;
if (HAS_KEY && !ACCOUNT?.authenticated) {
  console.warn(
    `[live-provider] SKIPPED — ANTHROPIC_API_KEY did not authenticate (${ACCOUNT?.detail ?? "unreachable"}). ` +
      "Issue a new key at console.anthropic.com to run the live drill.",
  );
}

describe.skipIf(!HAS_KEY || !ACCOUNT?.authenticated)("live provider drill (requires ANTHROPIC_API_KEY)", () => {
  it("reaches the Anthropic API and the key authenticates", async () => {
    const account = await probeAccount();
    expect(account.reachable).toBe(true);
    expect(account.authenticated).toBe(true);
  }, 30000);

  it("health probe reflects true usability of the account", async () => {
    const account = await probeAccount();
    const provider = new AnthropicProvider();
    const healthy = await provider.healthy();
    // healthy must agree with real usability: a billing-exhausted or
    // otherwise unusable key must NOT report healthy.
    expect(healthy).toBe(account.usable);
  }, 30000);

  it("live degradation drill: real provider failure → Emergency Mode + queue + admin alert; usable account → live AI analysis", async () => {
    const account = await probeAccount();
    const admin = await makeUser("ADMIN");
    const user = await makeUser();
    const site = await makeSite(`Mercy General Hospital ${uniq("live")}`);
    const orchestrator = new Orchestrator(db, [new AnthropicProvider(), new OpenAiProvider()]);

    const raw = `From: facilities@vendor.com\nSubject: Urgent boiler inspection at ${site.name}\nDate: Wed, 12 Aug 2026 09:00:00 -0500\nContent-Type: text/plain\n\nThe boiler inspection at ${site.name} failed and must be corrected by September 30, 2026. Please schedule the re-inspection immediately.`;
    const result = await ingestEmail(db, orchestrator, { rawSource: raw, uploadedById: user.id });
    const email = await db.emailMessage.findUniqueOrThrow({ where: { id: result.emailId } });

    if (account.usable) {
      // Live AI-quality checks.
      expect(result.mode).toBe("AI");
      expect(email.summary).toBeTruthy();
      expect(email.summary).not.toContain("[Deterministic]");
      expect(["HIGH", "URGENT"]).toContain(email.urgency);
      const links = await db.link.findMany({ where: { fromType: "EMAIL", fromId: result.emailId, toType: "SITE" } });
      expect(links.length).toBeGreaterThan(0); // live model identified the site
      expect(links.every((l) => !l.confirmed)).toBe(true); // still needs human confirmation
    } else {
      // Real provider failure (e.g. exhausted credits): the platform must
      // degrade honestly — deterministic analysis, queued AI work, alerts.
      expect(result.mode).toBe("EMERGENCY");
      expect(email.analysisMode).toBe("EMERGENCY");
      expect(email.rawSource).toBe(raw); // no data loss
      const queued = await db.aiQueueItem.findMany({ where: { status: "QUEUED", capability: "email.analyze" } });
      expect(queued.some((q) => JSON.parse(q.payloadJson).emailId === result.emailId)).toBe(true);
      const adminAlerts = await db.notification.findMany({ where: { userId: admin.id, type: "ALERT" } });
      expect(adminAlerts.length).toBeGreaterThan(0);
      const events = await db.providerEvent.findMany({ where: { provider: "anthropic" } });
      expect(events.length).toBeGreaterThan(0);
      // Drain must NOT mark the item done while the provider is unusable.
      const drained = await drainAiQueue(db, orchestrator);
      expect(drained.processed).toBe(0);
    }
  }, 120000);
});

describe.skipIf(HAS_KEY)("live provider drill placeholder", () => {
  it("skipped: no ANTHROPIC_API_KEY configured (expected in CI)", () => {
    expect(HAS_KEY).toBe(false);
  });
});
