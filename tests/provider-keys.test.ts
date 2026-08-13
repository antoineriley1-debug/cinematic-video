import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "./helpers";
import { sanitizeKey, keyFingerprint, keyFor, keySource, setProviderKey, loadProviderKeys } from "@/lib/ai/keys";
import { getAllSettings } from "@/lib/settings";

const ORIGINAL = process.env.ANTHROPIC_API_KEY;

beforeEach(async () => {
  await db.setting.deleteMany({ where: { key: { startsWith: "ai.key." } } });
  await loadProviderKeys(db);
});
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL;
});

describe("provider key sanitizing", () => {
  it("strips the ways a pasted key arrives broken", () => {
    expect(sanitizeKey('  sk-ant-test123  ')).toBe("sk-ant-test123");
    expect(sanitizeKey('"sk-ant-test123"')).toBe("sk-ant-test123");
    expect(sanitizeKey("'sk-ant-test123'")).toBe("sk-ant-test123");
    expect(sanitizeKey("sk-ant-\ntest123")).toBe("sk-ant-test123"); // wrapped paste
    expect(sanitizeKey("sk-ant- test123")).toBe("sk-ant-test123");
    expect(sanitizeKey("sk-proj-••••••")).toBe("sk-proj-"); // masked-field dots dropped
    expect(sanitizeKey("sk​-ant-x")).toBe("sk-ant-x"); // zero-width character
  });

  it("fingerprints differ for keys that differ by one lookalike character", () => {
    expect(keyFingerprint("sk-ant-aI0")).not.toBe(keyFingerprint("sk-ant-al0"));
    expect(keyFingerprint(undefined)).toBeNull();
    expect(keyFingerprint("sk-ant-aI0")).toHaveLength(8);
  });
});

describe("provider key resolution", () => {
  it("prefers the app-stored key over the environment and reports its source", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-from-env";
    await loadProviderKeys(db);
    expect(keyFor("anthropic")).toBe("sk-ant-from-env");
    expect(keySource("anthropic")).toBe("environment");

    await setProviderKey(db, "anthropic", "  sk-ant-from-app\n");
    expect(keyFor("anthropic")).toBe("sk-ant-from-app"); // sanitized on the way in
    expect(keySource("anthropic")).toBe("app");

    // Survives a fresh load (i.e. a new server process).
    await loadProviderKeys(db);
    expect(keyFor("anthropic")).toBe("sk-ant-from-app");

    // Clearing falls back to the environment.
    await setProviderKey(db, "anthropic", "   ");
    expect(keyFor("anthropic")).toBe("sk-ant-from-env");
    expect(keySource("anthropic")).toBe("environment");

    delete process.env.ANTHROPIC_API_KEY;
    await loadProviderKeys(db);
    expect(keyFor("anthropic")).toBeUndefined();
    expect(keySource("anthropic")).toBe("none");
  });

  it("stored keys never appear in the admin settings view", async () => {
    await setProviderKey(db, "anthropic", "sk-ant-secret-value");
    const settings = await getAllSettings(db);
    expect(JSON.stringify(settings)).not.toContain("sk-ant-secret-value");
  });
});
