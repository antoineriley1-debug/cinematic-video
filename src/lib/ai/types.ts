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
  /** Why the last healthy() probe failed (HTTP status + provider message). */
  probeDetail?: string;
  complete(req: AiRequest): Promise<AiResponse>;
}

/** Compress a provider error body to its human-readable message. */
export function probeFailureDetail(status: number, body: string): string {
  let message = body.slice(0, 300);
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; type?: string; status?: string } };
    if (parsed.error?.message) message = [parsed.error.type ?? parsed.error.status, parsed.error.message].filter(Boolean).join(" — ");
  } catch {
    // not JSON — keep the raw snippet
  }
  return `HTTP ${status}: ${message}`.slice(0, 400);
}

export class ProviderUnavailableError extends Error {
  constructor(provider: string, cause?: unknown) {
    const detail = typeof cause === "string" ? cause : cause instanceof Error ? cause.message : undefined;
    super(`AI provider ${provider} unavailable${detail ? ` (${detail})` : ""}`);
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
