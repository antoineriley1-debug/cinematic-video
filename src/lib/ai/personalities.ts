// EMAIL PERSONALITY ENGINE
// Configurable executive communication profiles. Incoming analysis behavior
// is separated from outgoing writing behavior. Each outgoing profile carries
// structured rules used to steer AI drafting AND a deterministic template
// used by Emergency Intelligence Mode.
import type { Personality } from "../validate";

export type PersonalityProfile = {
  key: Personality;
  label: string;
  rules: string[];
  emergencyTemplate: (ctx: DraftContext) => string;
};

export type DraftContext = {
  recipientName?: string;
  senderName: string;
  subject: string;
  issue: string; // what the email being answered is about (summary or excerpt)
  expectedAction?: string;
  completionDate?: string;
};

function greeting(ctx: DraftContext) {
  return ctx.recipientName ? `${ctx.recipientName},` : "Hello,";
}

export const PERSONALITY_PROFILES: Record<Personality, PersonalityProfile> = {
  STANDARD_EXECUTIVE: {
    key: "STANDARD_EXECUTIVE",
    label: "Standard Executive",
    rules: [
      "professional executive register",
      "acknowledge the message",
      "state position or decision clearly",
      "identify next step",
      "courteous closing",
    ],
    emergencyTemplate: (ctx) =>
      `${greeting(ctx)}\n\nThank you for the update regarding ${ctx.issue}.` +
      `\n\nI have reviewed the matter and will follow up with next steps shortly.${ctx.expectedAction ? ` In the meantime, please ${ctx.expectedAction}.` : ""}` +
      `\n\nRegards,\n${ctx.senderName}`,
  },
  PROFESSIONAL: {
    key: "PROFESSIONAL",
    label: "Professional",
    rules: ["formal tone", "complete sentences", "no colloquialisms", "clear structure", "courteous closing"],
    emergencyTemplate: (ctx) =>
      `${greeting(ctx)}\n\nI am writing in reference to ${ctx.issue}.` +
      `${ctx.expectedAction ? `\n\nPlease ${ctx.expectedAction}${ctx.completionDate ? ` by ${ctx.completionDate}` : ""}.` : ""}` +
      `\n\nThank you for your attention to this matter.\n\nSincerely,\n${ctx.senderName}`,
  },
  FRIENDLY: {
    key: "FRIENDLY",
    label: "Friendly",
    rules: ["warm tone", "personable opening", "positive framing", "still professional", "encouraging closing"],
    emergencyTemplate: (ctx) =>
      `Hi ${ctx.recipientName ?? "there"},\n\nThanks so much for reaching out about ${ctx.issue}.` +
      `${ctx.expectedAction ? ` When you have a moment, could you ${ctx.expectedAction}?` : ""}` +
      `\n\nAppreciate you!\n\nBest,\n${ctx.senderName}`,
  },
  CONCISE: {
    key: "CONCISE",
    label: "Concise",
    rules: ["three sentences or fewer", "no filler", "action first", "plain language"],
    emergencyTemplate: (ctx) =>
      `${greeting(ctx)}\n\nRe: ${ctx.issue}. ${ctx.expectedAction ? `Please ${ctx.expectedAction}${ctx.completionDate ? ` by ${ctx.completionDate}` : ""}.` : "Noted; I will follow up."}\n\n${ctx.senderName}`,
  },
  FIRM: {
    key: "FIRM",
    label: "Firm",
    rules: [
      "direct opening",
      "identify issue",
      "identify expected action",
      "identify accountable party",
      "request completion date where appropriate",
      "minimal filler",
      "professional language",
      "no insults",
      "no threats",
      "clear closing",
    ],
    emergencyTemplate: (ctx) =>
      `${greeting(ctx)}\n\nI need to be direct about ${ctx.issue}.` +
      `\n\n${ctx.expectedAction ? `The expected action is clear: ${ctx.expectedAction}.` : "This requires immediate attention."}` +
      `${ctx.completionDate ? ` Please confirm completion by ${ctx.completionDate}.` : " Please reply with a completion date."}` +
      `\n\nI expect this to be resolved without further escalation.\n\n${ctx.senderName}`,
  },
  ESCALATED: {
    key: "ESCALATED",
    label: "Escalated",
    rules: [
      "reference prior communications",
      "state that the matter is escalated",
      "state consequences of continued inaction factually",
      "set a firm deadline",
      "copy accountable leadership where appropriate",
      "professional language only",
    ],
    emergencyTemplate: (ctx) =>
      `${greeting(ctx)}\n\nThis matter — ${ctx.issue} — remains unresolved despite prior communication and is now escalated.` +
      `\n\n${ctx.expectedAction ? `Required action: ${ctx.expectedAction}.` : "A resolution plan is required."}` +
      ` A written response is required${ctx.completionDate ? ` no later than ${ctx.completionDate}` : " within two business days"}.` +
      `\n\n${ctx.senderName}`,
  },
  CORRECTIVE: {
    key: "CORRECTIVE",
    label: "Corrective",
    rules: [
      "state documented issue",
      "identify expected standard",
      "state required correction",
      "specify requested completion date",
      "specify follow-up",
      "remain factual",
      "avoid unsupported accusations",
    ],
    emergencyTemplate: (ctx) =>
      `${greeting(ctx)}\n\nThis message documents an issue requiring correction: ${ctx.issue}.` +
      `\n\nExpected standard: performance consistent with our operational requirements.` +
      `${ctx.expectedAction ? `\nRequired correction: ${ctx.expectedAction}.` : ""}` +
      `${ctx.completionDate ? `\nRequested completion date: ${ctx.completionDate}.` : ""}` +
      `\nA follow-up review will be scheduled to confirm the correction.` +
      `\n\nThis note is factual documentation of the matter described above.\n\n${ctx.senderName}`,
  },
  COACHING: {
    key: "COACHING",
    label: "Coaching",
    rules: [
      "supportive tone",
      "acknowledge strengths",
      "describe the growth area factually",
      "offer specific guidance",
      "invite dialogue",
      "express confidence",
    ],
    emergencyTemplate: (ctx) =>
      `${greeting(ctx)}\n\nI want to share some coaching feedback regarding ${ctx.issue}.` +
      `\n\nYou bring real strengths to your role, and I want to see you succeed here.` +
      `${ctx.expectedAction ? ` A concrete next step: ${ctx.expectedAction}.` : ""}` +
      `\n\nLet's find time to talk this through — I'm confident in your ability to close this gap.\n\n${ctx.senderName}`,
  },
  RECOGNITION: {
    key: "RECOGNITION",
    label: "Recognition",
    rules: ["specific praise", "name the impact", "sincere tone", "share credit appropriately"],
    emergencyTemplate: (ctx) =>
      `${greeting(ctx)}\n\nI want to recognize the excellent work on ${ctx.issue}.` +
      `\n\nThis kind of performance makes a real difference, and it does not go unnoticed.\n\nWell done,\n${ctx.senderName}`,
  },
  REQUEST_FOR_ACTION: {
    key: "REQUEST_FOR_ACTION",
    label: "Request for Action",
    rules: ["state the request in the first sentence", "give context second", "one clear owner", "explicit due date"],
    emergencyTemplate: (ctx) =>
      `${greeting(ctx)}\n\nAction requested: ${ctx.expectedAction ?? `respond regarding ${ctx.issue}`}${ctx.completionDate ? ` by ${ctx.completionDate}` : ""}.` +
      `\n\nContext: ${ctx.issue}.\n\nThank you,\n${ctx.senderName}`,
  },
  FOLLOW_UP: {
    key: "FOLLOW_UP",
    label: "Follow-Up",
    rules: ["reference the earlier thread", "restate the open item", "ask for status", "offer help removing blockers"],
    emergencyTemplate: (ctx) =>
      `${greeting(ctx)}\n\nFollowing up on ${ctx.issue}.` +
      `\n\nCould you share a status update${ctx.completionDate ? ` before ${ctx.completionDate}` : ""}? If anything is blocking progress, let me know and I will help clear it.\n\nThanks,\n${ctx.senderName}`,
  },
  DEADLINE_DRIVEN: {
    key: "DEADLINE_DRIVEN",
    label: "Deadline Driven",
    rules: ["lead with the deadline", "state what is due", "state consequences of missing it factually", "ask for confirmation"],
    emergencyTemplate: (ctx) =>
      `${greeting(ctx)}\n\nDeadline notice${ctx.completionDate ? `: ${ctx.completionDate}` : ""} — ${ctx.issue}.` +
      `\n\n${ctx.expectedAction ? `Due: ${ctx.expectedAction}.` : "Please confirm the deliverable is on track."}` +
      ` Reply to confirm the date is achievable.\n\n${ctx.senderName}`,
  },
};

export function draftPromptFor(personality: Personality, ctx: DraftContext, originalEmail: string): string {
  const profile = PERSONALITY_PROFILES[personality];
  return [
    `Draft a reply email in the "${profile.label}" executive communication style.`,
    `Rules for this style:`,
    ...profile.rules.map((r) => `- ${r}`),
    ``,
    `The reply is from ${ctx.senderName}${ctx.recipientName ? ` to ${ctx.recipientName}` : ""}.`,
    ctx.expectedAction ? `Expected action: ${ctx.expectedAction}` : "",
    ctx.completionDate ? `Requested completion date: ${ctx.completionDate}` : "",
    ``,
    `Original email:`,
    `"""`,
    originalEmail.slice(0, 6000),
    `"""`,
    ``,
    `Write only the reply body. No subject line, no commentary.`,
  ]
    .filter(Boolean)
    .join("\n");
}
