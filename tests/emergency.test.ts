import { describe, it, expect } from "vitest";
import { analyzeEmailDeterministic, analyzeMeetingDeterministic, extractDates, extractActions } from "@/lib/ai/emergency";
import type { EmergencyConfig } from "@/lib/ai/emergency";
import { DEFAULT_SETTINGS } from "@/lib/settings";

const config: EmergencyConfig = {
  urgentKeywords: DEFAULT_SETTINGS["emergency.urgentKeywords"],
  correctiveKeywords: DEFAULT_SETTINGS["emergency.correctiveKeywords"],
  escalationKeywords: DEFAULT_SETTINGS["emergency.escalationKeywords"],
  deadlineKeywords: DEFAULT_SETTINGS["emergency.deadlineKeywords"],
  sites: [{ id: "s1", name: "Mercy General Hospital" }],
  directors: [{ id: "d1", name: "Jane Delgado" }],
  vendors: [{ id: "v1", name: "Guardian Fire & Alarm Systems" }],
  contracts: [{ id: "c1", title: "Fire Alarm Inspection & Monitoring Agreement" }],
  projects: [],
};

describe("deterministic emergency intelligence engine", () => {
  it("classifies urgent email and detects entities", () => {
    const result = analyzeEmailDeterministic(
      {
        subject: "URGENT: fire alarm failure at Mercy General Hospital",
        bodyText:
          "The fire alarm panel is down. Guardian Fire & Alarm Systems must respond immediately. Jane Delgado has been notified. Please schedule repair by March 15, 2026.",
        fromName: "Facilities Desk",
      },
      config,
    );
    expect(result.mode).toBe("EMERGENCY");
    expect(result.urgency).toBe("URGENT");
    expect(result.suggestedSites).toContain("s1");
    expect(result.suggestedDirectors).toContain("d1");
    expect(result.suggestedVendors).toContain("v1");
    expect(result.dates.length).toBeGreaterThan(0);
    expect(result.actions.length).toBeGreaterThan(0);
  });

  it("classifies corrective language", () => {
    const result = analyzeEmailDeterministic(
      { subject: "Failed inspection follow-up", bodyText: "The deficiency from the failed inspection requires a corrective plan." },
      config,
    );
    expect(result.intent).toBe("CORRECTIVE");
    expect(result.urgency).toBe("HIGH");
  });

  it("handles a benign email without false urgency", () => {
    const result = analyzeEmailDeterministic(
      { subject: "Lunch schedule", bodyText: "The cafeteria menu was updated for spring." },
      config,
    );
    expect(result.urgency).toBe("NORMAL");
    expect(result.intent).toBe("GENERAL");
  });

  it("extracts multiple date formats", () => {
    const dates = extractDates("Due January 27, then 3/5/2026, and 2026-04-01.");
    expect(dates.length).toBe(3);
  });

  it("extracts action sentences", () => {
    const actions = extractActions("Hello team. Please submit the report. The weather is nice. You must complete training.");
    expect(actions.length).toBe(2);
  });

  it("analyzes meeting minutes deterministically", () => {
    const result = analyzeMeetingDeterministic(
      "We decided to approve the budget.\nOpen question: staffing plan is TBD.\nPlease schedule a follow-up with the vendor.",
    );
    expect(result.mode).toBe("EMERGENCY");
    expect(result.decisions.length).toBe(1);
    expect(result.unresolved.length).toBe(1);
    expect(result.followUps.length).toBe(1);
  });

  it("never labels deterministic output as AI", () => {
    const result = analyzeEmailDeterministic({ subject: "x", bodyText: "y" }, config);
    expect(result.mode).toBe("EMERGENCY");
    expect(result.summary).toContain("[Deterministic]");
  });
});
