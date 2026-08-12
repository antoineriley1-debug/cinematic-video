import { describe, it, expect } from "vitest";
import { db, makeUser, mockOrchestrator } from "./helpers";
import { AllProvidersDownError } from "@/lib/ai/types";

describe("AI orchestrator failover", () => {
  it("uses the primary provider when healthy", async () => {
    const { orchestrator, primary, secondary } = mockOrchestrator();
    const res = await orchestrator.complete({ capability: "email.analyze", system: "s", prompt: "p" });
    expect(res.provider).toBe("anthropic");
    expect(primary.calls.length).toBe(1);
    expect(secondary.calls.length).toBe(0);
  });

  it("fails over to secondary, notifies user and admins, and logs the event", async () => {
    const admin = await makeUser("ADMIN");
    const user = await makeUser();
    const { orchestrator, primary, secondary } = mockOrchestrator();
    primary.up = false;

    const res = await orchestrator.complete(
      { capability: "email.analyze", system: "s", prompt: "p" },
      { userId: user.id },
    );
    expect(res.provider).toBe("openai");
    expect(secondary.calls.length).toBe(1);

    const events = await db.providerEvent.findMany({ where: { provider: "anthropic", event: "FAILOVER" } });
    expect(events.length).toBeGreaterThan(0);

    const userNotices = await db.notification.findMany({ where: { userId: user.id, type: "AI_CONTINUITY" } });
    expect(userNotices.length).toBe(1);
    const adminNotices = await db.notification.findMany({ where: { userId: admin.id, type: "ALERT" } });
    expect(adminNotices.length).toBeGreaterThan(0);
  });

  it("throws AllProvidersDownError when everything is down and queues work", async () => {
    const { orchestrator, primary, secondary } = mockOrchestrator();
    primary.up = false;
    secondary.up = false;

    await expect(
      orchestrator.complete({ capability: "email.analyze", system: "s", prompt: "p" }),
    ).rejects.toBeInstanceOf(AllProvidersDownError);

    await orchestrator.queueWork("email.analyze", { emailId: "e1" });
    const queued = await db.aiQueueItem.findMany({ where: { status: "QUEUED" } });
    expect(queued.length).toBeGreaterThan(0);
  });

  it("throws when no provider is configured", async () => {
    const { orchestrator, primary, secondary } = mockOrchestrator();
    primary.isConfigured = false;
    secondary.isConfigured = false;
    await expect(
      orchestrator.complete({ capability: "email.analyze", system: "s", prompt: "p" }),
    ).rejects.toBeInstanceOf(AllProvidersDownError);
  });

  it("records recovery after a failed health check", async () => {
    const { orchestrator, primary } = mockOrchestrator();
    primary.up = false;
    await orchestrator.healthCheckAll();
    expect(orchestrator.providerStatuses().find((s) => s.name === "anthropic")?.healthy).toBe(false);

    primary.up = true;
    await orchestrator.healthCheckAll();
    expect(orchestrator.providerStatuses().find((s) => s.name === "anthropic")?.healthy).toBe(true);
    const recovered = await db.providerEvent.findMany({ where: { provider: "anthropic", event: "RECOVERED" } });
    expect(recovered.length).toBeGreaterThan(0);
  });
});
