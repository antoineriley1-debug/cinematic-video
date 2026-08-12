import { describe, it, expect } from "vitest";
import { db, makeUser, mockOrchestrator } from "./helpers";
import { draftEmailReply } from "@/lib/ai/capabilities";
import { PERSONALITY_PROFILES } from "@/lib/ai/personalities";
import { Personalities } from "@/lib/validate";

describe("email personality engine", () => {
  it("defines all twelve required outgoing profiles with rules and emergency templates", () => {
    expect(Personalities.length).toBe(12);
    for (const p of Personalities) {
      const profile = PERSONALITY_PROFILES[p];
      expect(profile.rules.length).toBeGreaterThanOrEqual(4);
      const draft = profile.emergencyTemplate({
        recipientName: "Jane",
        senderName: "Antoine Riley",
        subject: "Test",
        issue: "the failed fire alarm inspection",
        expectedAction: "schedule the re-inspection",
        completionDate: "March 15",
      });
      expect(draft.length).toBeGreaterThan(40);
      expect(draft).toContain("Jane");
    }
  });

  it("FIRM profile carries the required structural rules", () => {
    const rules = PERSONALITY_PROFILES.FIRM.rules.join("|");
    expect(rules).toContain("direct opening");
    expect(rules).toContain("expected action");
    expect(rules).toContain("no insults");
    expect(rules).toContain("no threats");
  });

  it("drafts via AI when available and marks the mode", async () => {
    const user = await makeUser();
    const { orchestrator } = mockOrchestrator({ primaryResponder: () => "Drafted reply body from AI." });
    const result = await draftEmailReply(db, orchestrator, "CORRECTIVE", { senderName: "Antoine", subject: "s", issue: "the missed audit" }, "original email text", { userId: user.id });
    expect(result.mode).toBe("AI");
    expect(result.content).toContain("Drafted reply");
  });

  it("falls back to the personality's deterministic template during a total outage", async () => {
    const user = await makeUser();
    const { orchestrator, primary, secondary } = mockOrchestrator();
    primary.up = false;
    secondary.up = false;
    const result = await draftEmailReply(db, orchestrator, "CORRECTIVE", { senderName: "Antoine Riley", subject: "s", issue: "the missed audit", expectedAction: "submit the corrective plan", completionDate: "Friday" }, "original", { userId: user.id });
    expect(result.mode).toBe("EMERGENCY");
    expect(result.content).toContain("requiring correction");
    expect(result.content).toContain("Friday");
    expect(result.content).toContain("Antoine Riley");
  });
});
