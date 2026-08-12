// Admin-configurable system settings with safe defaults.
// Nothing business-critical is hard-coded: infraction thresholds, contract
// watch windows, emergency-mode dictionaries, and retention are all here.
import type { Db } from "./db";

export type InfractionAlertRule = {
  count: number;
  windowDays: number;
  categories: string[]; // empty = all categories qualify
  minSeverity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  recipients: "ALL_EXECUTIVES" | "ADMINS";
  requireAcknowledgement: boolean;
};

export type SettingsShape = {
  "infraction.alertRule": InfractionAlertRule;
  "contracts.watchWindowDays": number;
  "briefing.meetingLookbackHours": number;
  "conversation.briefAfterInactiveDays": number;
  "patterns.directorConcernThreshold": number; // distinct executives documenting concerns
  "patterns.vendorSiteThreshold": number; // distinct sites documenting issues
  "emergency.urgentKeywords": string[];
  "emergency.correctiveKeywords": string[];
  "emergency.escalationKeywords": string[];
  "emergency.deadlineKeywords": string[];
  "uploads.maxBytes": number;
  "retention.conversationBriefs": "KEEP" | "ARCHIVE";
  "ai.primaryProvider": "anthropic" | "openai";
};

export const DEFAULT_SETTINGS: SettingsShape = {
  "infraction.alertRule": {
    count: 3,
    windowDays: 365,
    categories: [],
    minSeverity: "LOW",
    recipients: "ALL_EXECUTIVES",
    requireAcknowledgement: true,
  },
  "contracts.watchWindowDays": 90,
  "briefing.meetingLookbackHours": 24,
  "conversation.briefAfterInactiveDays": 7,
  "patterns.directorConcernThreshold": 2,
  "patterns.vendorSiteThreshold": 2,
  "emergency.urgentKeywords": ["urgent", "immediately", "asap", "critical", "emergency", "escalate", "outage", "failure", "down"],
  "emergency.correctiveKeywords": ["corrective", "violation", "non-compliance", "failed inspection", "deficiency", "citation", "warning"],
  "emergency.escalationKeywords": ["escalate", "unacceptable", "final notice", "legal", "terminate", "breach"],
  "emergency.deadlineKeywords": ["deadline", "due", "by end of", "no later than", "expires", "renewal"],
  "uploads.maxBytes": 50 * 1024 * 1024,
  "retention.conversationBriefs": "KEEP",
  "ai.primaryProvider": "anthropic",
};

export async function getSetting<K extends keyof SettingsShape>(
  db: Db,
  key: K,
): Promise<SettingsShape[K]> {
  const row = await db.setting.findUnique({ where: { key } });
  if (!row) return DEFAULT_SETTINGS[key];
  try {
    return JSON.parse(row.value) as SettingsShape[K];
  } catch {
    return DEFAULT_SETTINGS[key];
  }
}

export async function setSetting<K extends keyof SettingsShape>(
  db: Db,
  key: K,
  value: SettingsShape[K],
  updatedById?: string,
): Promise<void> {
  await db.setting.upsert({
    where: { key },
    update: { value: JSON.stringify(value), updatedById },
    create: { key, value: JSON.stringify(value), updatedById },
  });
}

export async function getAllSettings(db: Db): Promise<SettingsShape> {
  const rows = await db.setting.findMany();
  const merged = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const row of rows) {
    if (row.key in DEFAULT_SETTINGS) {
      try {
        merged[row.key] = JSON.parse(row.value);
      } catch {
        // keep default
      }
    }
  }
  return merged as SettingsShape;
}
