import "server-only";
import type { AiProvider, AiRequest, AiResponse } from "../types";
import { ProviderUnavailableError } from "../types";

// Server-side only — the key never reaches the browser.
export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";

  configured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  async healthy(): Promise<boolean> {
    if (!this.configured()) return false;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          model: this.model(),
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }),
        signal: AbortSignal.timeout(8000),
      });
      return res.status < 500 && res.status !== 429;
    } catch {
      return false;
    }
  }

  async complete(req: AiRequest): Promise<AiResponse> {
    if (!this.configured()) throw new ProviderUnavailableError(this.name, "not configured");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          model: this.model(),
          max_tokens: req.maxTokens ?? 2048,
          system: req.system + (req.json ? "\nRespond with valid JSON only — no prose, no code fences." : ""),
          messages: [{ role: "user", content: req.prompt }],
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new ProviderUnavailableError(this.name, `HTTP ${res.status}`);
      const data = (await res.json()) as { content: { type: string; text?: string }[] };
      const text = data.content?.find((b) => b.type === "text")?.text ?? "";
      if (!text) throw new ProviderUnavailableError(this.name, "empty response");
      return { text, provider: this.name, mode: "AI" };
    } catch (err) {
      if (err instanceof ProviderUnavailableError) throw err;
      throw new ProviderUnavailableError(this.name, err);
    }
  }

  private headers() {
    return {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    };
  }

  private model() {
    return process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
  }
}
