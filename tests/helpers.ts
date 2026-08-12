import { PrismaClient } from "@prisma/client";
import { Orchestrator } from "@/lib/ai/orchestrator";
import { MockProvider } from "@/lib/ai/providers/mock";

export const db = new PrismaClient();

let counter = 0;
export function uniq(prefix: string): string {
  return `${prefix}-${Date.now()}-${++counter}`;
}

export async function makeUser(role = "EXECUTIVE", name?: string) {
  return db.user.create({
    data: {
      email: `${uniq("user")}@test.local`,
      name: name ?? uniq("User"),
      role,
      passwordHash: "x",
    },
  });
}

export async function makeSite(name?: string) {
  return db.site.create({ data: { name: name ?? uniq("Site"), code: uniq("CODE") } });
}

export async function makeDirector(siteId?: string, name?: string) {
  return db.director.create({ data: { name: name ?? uniq("Director"), siteId: siteId ?? null } });
}

export async function makeVendor(name?: string) {
  return db.vendor.create({ data: { name: name ?? uniq("Vendor") } });
}

/** Orchestrator with two controllable mock providers (anthropic-order first). */
export function mockOrchestrator(opts?: {
  primaryResponder?: (req: { capability: string; json?: boolean }) => string;
  secondaryResponder?: (req: { capability: string; json?: boolean }) => string;
}) {
  const primary = new MockProvider("anthropic", opts?.primaryResponder as never);
  const secondary = new MockProvider("openai", opts?.secondaryResponder as never);
  const orchestrator = new Orchestrator(db, [primary, secondary]);
  return { orchestrator, primary, secondary };
}

export const EMAIL_ANALYSIS_JSON = JSON.stringify({
  summary: "Vendor reported a failed fire alarm inspection at Mercy General.",
  intent: "CORRECTIVE",
  urgency: "HIGH",
  bullets: ["Inspection failed", "Repair required"],
  actions: ["Schedule re-inspection"],
  dates: [{ text: "March 5", iso: "2026-03-05" }],
  people: ["Jane Delgado"],
  sites: [],
  directors: [],
  vendors: [],
  contracts: [],
  projects: [],
});

export const MEETING_ANALYSIS_JSON = JSON.stringify({
  summary: "Weekly ops review covering staffing and the OR cleaning project.",
  decisions: ["Approved overtime budget for March"],
  keyDiscussion: ["Staffing gaps on nights"],
  actions: [{ title: "Post two EVS technician openings", owner: "Jane Delgado", due: "2026-03-10" }],
  unresolved: ["Pending decision on floor machine purchase"],
  followUps: ["Review staffing next week"],
});
