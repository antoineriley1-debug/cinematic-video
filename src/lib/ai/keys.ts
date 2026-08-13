// Provider credentials, resolved from the admin console first and the
// server environment second. Keys entered in the app are stored in Setting
// rows so they can be corrected without a redeploy, and every value is
// sanitized on the way in — pasted keys routinely arrive with surrounding
// quotes, stray whitespace/newlines, or masking characters copied from a
// hidden field, all of which make a valid key look invalid.
import { createHash } from "node:crypto";
import type { Db } from "../db";

export type ProviderName = "anthropic" | "google" | "openai";

export const PROVIDER_ENV: Record<ProviderName, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  google: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
};

const SETTING_PREFIX = "ai.key.";
const overrides = new Map<ProviderName, string>();

/**
 * Strip everything an API key can never contain: surrounding quotes, all
 * whitespace (including newlines from a wrapped paste), and non-ASCII
 * characters such as the bullet dots copied out of a masked field.
 */
export function sanitizeKey(raw: string): string {
  let value = raw.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    value = value.slice(1, -1);
  return value.replace(/\s+/g, "").replace(/[^\x21-\x7e]/g, "");
}

/** Short, non-reversible identifier so two keys can be compared safely. */
export function keyFingerprint(key: string | undefined): string | null {
  if (!key) return null;
  return createHash("sha256").update(key).digest("hex").slice(0, 8);
}

/** Load app-configured keys into the in-process cache. */
export async function loadProviderKeys(db: Db): Promise<void> {
  const rows = await db.setting.findMany({ where: { key: { startsWith: SETTING_PREFIX } } });
  overrides.clear();
  for (const row of rows) {
    const name = row.key.slice(SETTING_PREFIX.length) as ProviderName;
    const value = sanitizeKey(row.value);
    if (value) overrides.set(name, value);
  }
}

/** The key in force for a provider: admin console value, else environment. */
export function keyFor(provider: ProviderName): string | undefined {
  const override = overrides.get(provider);
  if (override) return override;
  const fromEnv = process.env[PROVIDER_ENV[provider]];
  const cleaned = fromEnv ? sanitizeKey(fromEnv) : "";
  return cleaned || undefined;
}

export function keySource(provider: ProviderName): "app" | "environment" | "none" {
  if (overrides.get(provider)) return "app";
  return keyFor(provider) ? "environment" : "none";
}

/** Save (or clear, when blank) an admin-entered key. Returns the stored value. */
export async function setProviderKey(db: Db, provider: ProviderName, raw: string, updatedById?: string) {
  const value = sanitizeKey(raw);
  const key = `${SETTING_PREFIX}${provider}`;
  if (!value) {
    await db.setting.deleteMany({ where: { key } });
    overrides.delete(provider);
    return undefined;
  }
  await db.setting.upsert({
    where: { key },
    update: { value, updatedById: updatedById ?? null },
    create: { key, value, updatedById: updatedById ?? null },
  });
  overrides.set(provider, value);
  return value;
}
