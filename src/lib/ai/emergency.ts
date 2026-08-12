// DETERMINISTIC EMERGENCY INTELLIGENCE ENGINE
// Pure, rule-based analysis used when every AI provider is down. Activation
// is controlled by provider-health logic in the orchestrator — never by a
// user choice. Output is honestly labeled mode: "EMERGENCY" and the UI
// displays "Emergency Intelligence Mode" so nobody mistakes deterministic
// output for full AI reasoning.

export type EmergencyConfig = {
  urgentKeywords: string[];
  correctiveKeywords: string[];
  escalationKeywords: string[];
  deadlineKeywords: string[];
  sites: { id: string; name: string }[];
  directors: { id: string; name: string }[];
  vendors: { id: string; name: string }[];
  contracts: { id: string; title: string }[];
  projects: { id: string; name: string }[];
};

export type EmergencyEmailInput = {
  subject: string;
  bodyText: string;
  fromAddress?: string;
  fromName?: string;
};

import type { EmailAnalysis, MeetingAnalysis } from "./types";

const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december";
const DATE_PATTERNS = [
  new RegExp(`\\b(${MONTHS})\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?`, "gi"),
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
  /\b\d{4}-\d{2}-\d{2}\b/g,
];

function containsAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

function findEntities<T extends { id: string }>(
  text: string,
  entities: T[],
  nameOf: (e: T) => string,
): string[] {
  const lower = text.toLowerCase();
  return entities.filter((e) => nameOf(e).length >= 3 && lower.includes(nameOf(e).toLowerCase())).map((e) => e.id);
}

export function extractDates(text: string): { text: string }[] {
  const found = new Set<string>();
  for (const pattern of DATE_PATTERNS) {
    for (const m of text.matchAll(pattern)) found.add(m[0]);
  }
  return [...found].map((t) => ({ text: t }));
}

/** Deterministic sentence-level action detection. */
export function extractActions(text: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const actionVerbs = /\b(please|must|need to|needs to|required to|should|ensure|complete|submit|schedule|review|confirm|send|provide|follow up|address|correct|resolve)\b/i;
  return sentences.filter((s) => actionVerbs.test(s)).slice(0, 10);
}

export function analyzeEmailDeterministic(input: EmergencyEmailInput, config: EmergencyConfig): EmailAnalysis {
  const text = `${input.subject}\n${input.bodyText}`;
  const urgent = containsAny(text, config.urgentKeywords);
  const corrective = containsAny(text, config.correctiveKeywords);
  const escalation = containsAny(text, config.escalationKeywords);
  const hasDeadline = containsAny(text, config.deadlineKeywords);

  let intent = "GENERAL";
  if (escalation) intent = "ESCALATION";
  else if (corrective) intent = "CORRECTIVE";
  else if (hasDeadline) intent = "DEADLINE";
  else if (urgent) intent = "URGENT_REQUEST";

  const urgency: EmailAnalysis["urgency"] = escalation || urgent ? "URGENT" : hasDeadline || corrective ? "HIGH" : "NORMAL";

  const firstLines = input.bodyText
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 20)
    .slice(0, 3);

  return {
    summary:
      `[Deterministic] ${input.fromName || input.fromAddress || "Sender"} — ` +
      `${input.subject || "(no subject)"}. Classified as ${intent.replaceAll("_", " ").toLowerCase()}, urgency ${urgency.toLowerCase()}.`,
    intent,
    urgency,
    bullets: firstLines,
    actions: extractActions(input.bodyText),
    dates: extractDates(text),
    people: input.fromName ? [input.fromName] : [],
    suggestedSites: findEntities(text, config.sites, (s) => s.name),
    suggestedDirectors: findEntities(text, config.directors, (d) => d.name),
    suggestedVendors: findEntities(text, config.vendors, (v) => v.name),
    suggestedContracts: findEntities(text, config.contracts, (c) => c.title),
    suggestedProjects: findEntities(text, config.projects, (p) => p.name),
    mode: "EMERGENCY",
  };
}

export function analyzeMeetingDeterministic(minutesText: string): MeetingAnalysis {
  const lines = minutesText.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const decisions = lines.filter((l) => /\b(decided|decision|agreed|approved|resolved)\b/i.test(l)).slice(0, 10);
  const actions = extractActions(minutesText).map((title) => ({ title }));
  const unresolved = lines.filter((l) => /\b(open question|unresolved|tbd|to be determined|pending decision)\b/i.test(l)).slice(0, 10);
  return {
    summary: `[Deterministic] Meeting minutes: ${lines.length} lines captured. ${decisions.length} decision statements and ${actions.length} action statements detected by rule-based parsing.`,
    decisions,
    keyDiscussion: lines.slice(0, 5),
    actions,
    unresolved,
    followUps: lines.filter((l) => /\bfollow[- ]?up\b/i.test(l)).slice(0, 10),
    mode: "EMERGENCY",
  };
}
