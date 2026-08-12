import { describe, it, expect, afterEach, vi } from "vitest";
import { GoogleProvider } from "@/lib/ai/providers/google";
import { ProviderUnavailableError } from "@/lib/ai/types";
import { Orchestrator } from "@/lib/ai/orchestrator";
import { MockProvider } from "@/lib/ai/providers/mock";
import { db } from "./helpers";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.GEMINI_API_KEY;
});

function stubFetch(response: { status: number; body: unknown }) {
  globalThis.fetch = vi.fn(async () =>
    new Response(JSON.stringify(response.body), { status: response.status, headers: { "content-type": "application/json" } }),
  ) as unknown as typeof fetch;
  return globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
}

describe("Google Gemini provider adapter", () => {
  it("is unconfigured without a key and never claims health", async () => {
    const provider = new GoogleProvider();
    expect(provider.configured()).toBe(false);
    expect(await provider.healthy()).toBe(false);
    await expect(provider.complete({ capability: "email.analyze", system: "s", prompt: "p" })).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });

  it("parses a Gemini generateContent response", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const fetchMock = stubFetch({
      status: 200,
      body: { candidates: [{ content: { parts: [{ text: "hello " }, { text: "world" }] } }] },
    });
    const provider = new GoogleProvider();
    const res = await provider.complete({ capability: "email.analyze", system: "sys", prompt: "user prompt" });
    expect(res.text).toBe("hello world");
    expect(res.provider).toBe("google");
    expect(res.mode).toBe("AI");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("generativelanguage.googleapis.com");
    expect(url).toContain(":generateContent");
    const body = JSON.parse(String(init.body));
    expect(body.system_instruction.parts[0].text).toBe("sys");
    expect(body.contents[0].parts[0].text).toBe("user prompt");
  });

  it("requests JSON output mode when asked", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const fetchMock = stubFetch({ status: 200, body: { candidates: [{ content: { parts: [{ text: "{}" }] } }] } });
    const provider = new GoogleProvider();
    await provider.complete({ capability: "email.analyze", system: "s", prompt: "p", json: true });
    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });

  it("maps HTTP errors and empty responses to ProviderUnavailableError", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    stubFetch({ status: 500, body: { error: "boom" } });
    const provider = new GoogleProvider();
    await expect(provider.complete({ capability: "email.analyze", system: "s", prompt: "p" })).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
    stubFetch({ status: 200, body: { candidates: [] } });
    await expect(provider.complete({ capability: "email.analyze", system: "s", prompt: "p" })).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });

  it("health probe: ok and 429 are healthy; 400/403 are not", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const provider = new GoogleProvider();
    stubFetch({ status: 200, body: { models: [] } });
    expect(await provider.healthy()).toBe(true);
    stubFetch({ status: 429, body: {} });
    expect(await provider.healthy()).toBe(true);
    stubFetch({ status: 403, body: {} });
    expect(await provider.healthy()).toBe(false);
  });
});

describe("three-provider failover", () => {
  it("fails over primary → google when the second provider is Google", async () => {
    const primary = new MockProvider("anthropic");
    const google = new MockProvider("google");
    const openai = new MockProvider("openai");
    primary.up = false;
    const orchestrator = new Orchestrator(db, [primary, google, openai]);

    const res = await orchestrator.complete({ capability: "email.analyze", system: "s", prompt: "p" });
    expect(res.provider).toBe("google");
    expect(openai.calls.length).toBe(0); // third provider untouched

    const failover = await db.providerEvent.findMany({ where: { provider: "anthropic", event: "FAILOVER" } });
    expect(failover.length).toBeGreaterThan(0);
  });

  it("cascades to the third provider when the first two are down", async () => {
    const primary = new MockProvider("anthropic");
    const google = new MockProvider("google");
    const openai = new MockProvider("openai");
    primary.up = false;
    google.up = false;
    const orchestrator = new Orchestrator(db, [primary, google, openai]);
    const res = await orchestrator.complete({ capability: "email.analyze", system: "s", prompt: "p" });
    expect(res.provider).toBe("openai");
  });
});
