// Test double used by the AI evaluation and failover test suites.
import type { AiProvider, AiRequest, AiResponse } from "../types";
import { ProviderUnavailableError } from "../types";

export class MockProvider implements AiProvider {
  readonly name: string;
  up = true;
  isConfigured = true;
  calls: AiRequest[] = [];
  responder: (req: AiRequest) => string;

  constructor(name = "mock", responder?: (req: AiRequest) => string) {
    this.name = name;
    this.responder = responder ?? ((req) => (req.json ? "{}" : `mock:${req.capability}`));
  }

  configured(): boolean {
    return this.isConfigured;
  }

  async healthy(): Promise<boolean> {
    return this.up && this.isConfigured;
  }

  async complete(req: AiRequest): Promise<AiResponse> {
    if (!this.up) throw new ProviderUnavailableError(this.name, "simulated outage");
    this.calls.push(req);
    return { text: this.responder(req), provider: this.name, mode: "AI" };
  }
}
