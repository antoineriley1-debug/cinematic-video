import "server-only";
import type { AiProvider, AiRequest, AiResponse } from "../types";
import { ProviderUnavailableError, probeFailureDetail } from "../types";

// Google Gemini adapter. Server-side only — the key never reaches the browser.
export class GoogleProvider implements AiProvider {
  readonly name = "google";
  probeDetail?: string;

  configured(): boolean {
    return Boolean(process.env.GEMINI_API_KEY);
  }

  async healthy(): Promise<boolean> {
    if (!this.configured()) {
      this.probeDetail = "no API key configured";
      return false;
    }
    try {
      // Probe with a minimal real completion: the models list returns 200
      // even when the project has no credits, and Google reports depleted
      // credits as 429, so only an actual successful generation proves the
      // provider is usable.
      const model = process.env.GEMINI_MODEL || "gemini-flash-latest";
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "ping" }] }],
            generationConfig: { maxOutputTokens: 1 },
          }),
          signal: AbortSignal.timeout(8000),
        },
      );
      if (res.ok) {
        this.probeDetail = undefined;
        return true;
      }
      this.probeDetail = probeFailureDetail(res.status, await res.text());
      return false;
    } catch (err) {
      this.probeDetail = `network: ${err instanceof Error ? err.message : String(err)}`;
      return false;
    }
  }

  async complete(req: AiRequest): Promise<AiResponse> {
    if (!this.configured()) throw new ProviderUnavailableError(this.name, "not configured");
    try {
      const model = process.env.GEMINI_MODEL || "gemini-flash-latest";
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: req.system }] },
            contents: [{ role: "user", parts: [{ text: req.prompt }] }],
            generationConfig: {
              maxOutputTokens: req.maxTokens ?? 2048,
              ...(req.json ? { responseMimeType: "application/json" } : {}),
            },
          }),
          signal: AbortSignal.timeout(60000),
        },
      );
      if (!res.ok) throw new ProviderUnavailableError(this.name, probeFailureDetail(res.status, await res.text()));
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (!text) throw new ProviderUnavailableError(this.name, "empty response");
      return { text, provider: this.name, mode: "AI" };
    } catch (err) {
      if (err instanceof ProviderUnavailableError) throw err;
      throw new ProviderUnavailableError(this.name, err);
    }
  }
}
