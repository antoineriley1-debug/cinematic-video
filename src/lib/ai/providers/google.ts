import "server-only";
import type { AiProvider, AiRequest, AiResponse } from "../types";
import { ProviderUnavailableError } from "../types";

// Google Gemini adapter. Server-side only — the key never reaches the browser.
export class GoogleProvider implements AiProvider {
  readonly name = "google";

  configured(): boolean {
    return Boolean(process.env.GEMINI_API_KEY);
  }

  async healthy(): Promise<boolean> {
    if (!this.configured()) return false;
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
      return res.ok;
    } catch {
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
      if (!res.ok) throw new ProviderUnavailableError(this.name, `HTTP ${res.status}`);
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
