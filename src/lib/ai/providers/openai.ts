import "server-only";
import type { AiProvider, AiRequest, AiResponse } from "../types";
import { ProviderUnavailableError } from "../types";

export class OpenAiProvider implements AiProvider {
  readonly name = "openai";

  configured(): boolean {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  async healthy(): Promise<boolean> {
    if (!this.configured()) return false;
    try {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        signal: AbortSignal.timeout(8000),
      });
      return res.ok || res.status === 429;
    } catch {
      return false;
    }
  }

  async complete(req: AiRequest): Promise<AiResponse> {
    if (!this.configured()) throw new ProviderUnavailableError(this.name, "not configured");
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-4o",
          max_tokens: req.maxTokens ?? 2048,
          ...(req.json ? { response_format: { type: "json_object" } } : {}),
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.prompt },
          ],
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new ProviderUnavailableError(this.name, `HTTP ${res.status}`);
      const data = (await res.json()) as { choices: { message: { content: string } }[] };
      const text = data.choices?.[0]?.message?.content ?? "";
      if (!text) throw new ProviderUnavailableError(this.name, "empty response");
      return { text, provider: this.name, mode: "AI" };
    } catch (err) {
      if (err instanceof ProviderUnavailableError) throw err;
      throw new ProviderUnavailableError(this.name, err);
    }
  }
}
