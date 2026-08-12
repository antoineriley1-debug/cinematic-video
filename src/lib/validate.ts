// Enum-like value sets, validated in application code because the SQLite
// connector does not support Prisma enums. Every String status/category
// column in schema.prisma has its legal values defined here.
import { z } from "zod";

export const Roles = ["ADMIN", "EXECUTIVE"] as const;

export const EntityTypes = [
  "SITE",
  "DIRECTOR",
  "VENDOR",
  "CONTRACT",
  "PROJECT",
  "EMAIL",
  "MEETING",
  "PLAUD",
  "NOTE",
  "ACTION",
  "SITE_VISIT",
  "INFRACTION",
  "FILE",
  "CONVERSATION",
  "ALERT",
  "USER",
  "VENDOR_PERFORMANCE",
  "DIRECTOR_FILE_ENTRY",
  "EMAIL_BATCH",
  "MEMORY",
  "BRIEFING",
  "SETTING",
  "COMMENT",
  "DRAFT",
] as const;
export type EntityType = (typeof EntityTypes)[number];
export const zEntityType = z.enum(EntityTypes);

export const ObservationCategories = [
  "POSITIVE",
  "IMPROVEMENT",
  "TRAINING",
  "CRITICAL",
  "PROJECT",
  "BACKBURNER",
] as const;
export const zObservationCategory = z.enum(ObservationCategories);

export const DirectorFileClassifications = [
  "RECOGNITION",
  "GENERAL",
  "COACHING",
  "CORRECTIVE",
  "INFRACTION",
  "TRAINING",
  "PERFORMANCE",
  "PROJECT",
  "FOLLOW_UP",
] as const;
export const zDirectorFileClassification = z.enum(DirectorFileClassifications);

export const InfractionSeverities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const zInfractionSeverity = z.enum(InfractionSeverities);

export const VendorPerformanceTypes = [
  "POSITIVE",
  "CONCERN",
  "QUALITY_ISSUE",
  "SERVICE_ISSUE",
  "MISSED_REQUIREMENT",
  "MISSED_DEADLINE",
  "CONTRACT_CONCERN",
  "ESCALATION",
  "RESOLUTION",
] as const;
export const zVendorPerformanceType = z.enum(VendorPerformanceTypes);

export const FlagLabels = ["FOLLOW_UP", "IMPORTANT", "REVIEW", "ASK_LATER", "PRIORITY"] as const;
export const zFlagLabel = z.enum(FlagLabels);

export const Urgencies = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

export const Personalities = [
  "STANDARD_EXECUTIVE",
  "PROFESSIONAL",
  "FRIENDLY",
  "CONCISE",
  "FIRM",
  "ESCALATED",
  "CORRECTIVE",
  "COACHING",
  "RECOGNITION",
  "REQUEST_FOR_ACTION",
  "FOLLOW_UP",
  "DEADLINE_DRIVEN",
] as const;
export type Personality = (typeof Personalities)[number];
export const zPersonality = z.enum(Personalities);

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
