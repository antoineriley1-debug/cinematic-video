// AI provider abstraction. Business modules request capabilities from the
// orchestrator — they never call a specific vendor. Vendors are replaceable.

export type AiCapability =
  | "email.analyze"
  | "email.draft"
  | "meeting.analyze"
  | "plaud.analyze"
  | "conversation.brief"
  | "chief.answer"
  | "classify.recommend";

export type AiRequest = {
  capability: AiCapability;
  system: string;
  prompt: string;
  json?: boolean; // request structured JSON output
  maxTokens?: number;
};

export type AiResponse = {
  text: string;
  provider: string;
  mode: "AI";
};

export interface AiProvider {
  readonly name: string;
  /** True when the provider is configured (credentials present). */
  configured(): boolean;
  /** Cheap health probe; must not throw. */
  healthy(): Promise<boolean>;
  complete(req: AiRequest): Promise<AiResponse>;
}

export class ProviderUnavailableError extends Error {
  constructor(provider: string, cause?: unknown) {
    super(`AI provider ${provider} unavailable`);
    this.name = "ProviderUnavailableError";
    this.cause = cause;
  }
}

export class AllProvidersDownError extends Error {
  constructor() {
    super("All AI providers unavailable");
    this.name = "AllProvidersDownError";
  }
}

export type EmailAnalysis = {
  summary: string;
  intent: string;
  urgency: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  bullets: string[];
  actions: string[];
  dates: { text: string; iso?: string }[];
  people: string[];
  suggestedSites: string[];
  suggestedDirectors: string[];
  suggestedVendors: string[];
  suggestedContracts: string[];
  suggestedProjects: string[];
  mode: "AI" | "EMERGENCY";
};

export type MeetingAnalysis = {
  summary: string;
  decisions: string[];
  keyDiscussion: string[];
  actions: { title: string; owner?: string; due?: string }[];
  unresolved: string[];
  followUps: string[];
  mode: "AI" | "EMERGENCY";
};
