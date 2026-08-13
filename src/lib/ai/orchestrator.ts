// AI Orchestrator: provider routing, health tracking, automatic failover,
// admin/user notifications, and safe queueing when every provider is down.
// Emergency Intelligence Mode activation is controlled here by provider
// health — users cannot manually activate it.
import type { Db } from "../db";
import { getSetting } from "../settings";
import { notify } from "../notify";
import type { AiProvider, AiRequest, AiResponse } from "./types";
import { AllProvidersDownError, ProviderUnavailableError } from "./types";
import { loadProviderKeys } from "./keys";

export type ProviderStatus = {
  name: string;
  configured: boolean;
  healthy: boolean | null; // null = not probed yet
  lastError: string | null;
  lastCheckedAt: Date | null;
};

export class Orchestrator {
  private status = new Map<string, ProviderStatus>();

  constructor(
    private db: Db,
    private providers: AiProvider[],
  ) {
    for (const p of providers) {
      this.status.set(p.name, {
        name: p.name,
        configured: p.configured(),
        healthy: null,
        lastError: null,
        lastCheckedAt: null,
      });
    }
  }

  providerStatuses(): ProviderStatus[] {
    return [...this.status.values()];
  }

  /** True while at least one provider is believed available. */
  aiAvailable(): boolean {
    return this.orderedProviders().some((p) => {
      const s = this.status.get(p.name);
      return p.configured() && s?.healthy !== false;
    });
  }

  private async orderedProvidersAsync(): Promise<AiProvider[]> {
    const primary = await getSetting(this.db, "ai.primaryProvider").catch(() => "anthropic");
    return this.orderedProviders(primary);
  }

  private orderedProviders(primary?: string): AiProvider[] {
    const name = primary ?? "anthropic";
    return [...this.providers].sort((a, b) => (a.name === name ? -1 : b.name === name ? 1 : 0));
  }

  async healthCheckAll(): Promise<ProviderStatus[]> {
    await loadProviderKeys(this.db); // pick up keys saved in the admin console
    for (const p of this.providers) {
      const ok = await p.healthy();
      const prev = this.status.get(p.name);
      const wasDown = prev?.healthy === false;
      this.status.set(p.name, {
        name: p.name,
        configured: p.configured(),
        healthy: ok,
        lastError: ok ? null : (p.probeDetail ?? prev?.lastError ?? "health check failed"),
        lastCheckedAt: new Date(),
      });
      if (!ok && prev?.healthy !== false) {
        await this.db.providerEvent.create({ data: { provider: p.name, event: "HEALTH_FAIL", detail: p.probeDetail ?? null } });
      }
      if (ok && wasDown) {
        await this.db.providerEvent.create({ data: { provider: p.name, event: "RECOVERED" } });
      }
    }
    return this.providerStatuses();
  }

  /**
   * Complete a capability request. Tries the configured primary, fails over
   * to the secondary with notifications, throws AllProvidersDownError when
   * nothing is available so callers can drop to the deterministic engine.
   */
  async complete(req: AiRequest, opts?: { userId?: string }): Promise<AiResponse> {
    await loadProviderKeys(this.db);
    const ordered = await this.orderedProvidersAsync();
    const configured = ordered.filter((p) => p.configured());
    let lastErr: unknown = null;
    for (let i = 0; i < configured.length; i++) {
      const provider = configured[i];
      try {
        const res = await provider.complete(req);
        this.markUp(provider.name);
        return res;
      } catch (err) {
        lastErr = err;
        this.markDown(provider.name, err);
        await this.db.providerEvent.create({
          data: {
            provider: provider.name,
            event: i < configured.length - 1 ? "FAILOVER" : "OUTAGE",
            detail: err instanceof Error ? err.message : String(err),
          },
        });
        const hasNext = i < configured.length - 1;
        if (hasNext) {
          await this.notifyFailover(provider.name, configured[i + 1].name, opts?.userId);
        } else {
          await this.notifyOutage(opts?.userId);
        }
      }
    }
    if (configured.length === 0) {
      await this.db.providerEvent.create({
        data: { provider: "none", event: "OUTAGE", detail: "no provider configured" },
      });
    }
    throw lastErr instanceof ProviderUnavailableError || configured.length === 0
      ? new AllProvidersDownError()
      : new AllProvidersDownError();
  }

  /** Queue AI work safely so nothing is lost during a total outage. */
  async queueWork(capability: string, payload: unknown): Promise<void> {
    await this.db.aiQueueItem.create({
      data: { capability, payloadJson: JSON.stringify(payload) },
    });
  }

  private markUp(name: string) {
    const s = this.status.get(name);
    this.status.set(name, { ...(s ?? { name, configured: true, lastError: null, lastCheckedAt: null }), name, configured: true, healthy: true, lastError: null, lastCheckedAt: new Date() });
  }

  private markDown(name: string, err: unknown) {
    const s = this.status.get(name);
    this.status.set(name, {
      ...(s ?? { name, configured: true, lastCheckedAt: null }),
      name,
      configured: true,
      healthy: false,
      lastError: err instanceof Error ? err.message : String(err),
      lastCheckedAt: new Date(),
    });
  }

  private async notifyFailover(failed: string, assumed: string, userId?: string) {
    // Subtle continuity notice to the affected user; technical alert to admins.
    if (userId) {
      await notify(this.db, {
        userId,
        type: "AI_CONTINUITY",
        title: "AI continuity notice",
        body: "Your request was completed by the backup intelligence provider. No action is needed.",
      });
    }
    const admins = await this.db.user.findMany({ where: { role: "ADMIN", active: true } });
    for (const admin of admins) {
      await notify(this.db, {
        userId: admin.id,
        type: "ALERT",
        title: `AI provider failover: ${failed} → ${assumed}`,
        body: `Provider "${failed}" failed and "${assumed}" assumed the capability. See Admin → AI Providers.`,
      });
    }
  }

  private async notifyOutage(userId?: string) {
    if (userId) {
      await notify(this.db, {
        userId,
        type: "AI_CONTINUITY",
        title: "Emergency Intelligence Mode",
        body: "All AI providers are currently unavailable. Deterministic emergency intelligence is active; AI work is queued and no data is lost.",
      });
    }
    const admins = await this.db.user.findMany({ where: { role: "ADMIN", active: true } });
    for (const admin of admins) {
      await notify(this.db, {
        userId: admin.id,
        type: "ALERT",
        title: "AI provider outage — Emergency Intelligence Mode active",
        body: "All configured AI providers are unavailable. Deterministic processing is serving supported functions.",
      });
    }
  }
}

// Server singleton wired to real providers. Test suites construct their own
// Orchestrator with MockProviders instead.
let _orchestrator: Orchestrator | null = null;

export async function getOrchestrator(db: Db): Promise<Orchestrator> {
  if (_orchestrator) return _orchestrator;
  const { AnthropicProvider } = await import("./providers/anthropic");
  const { OpenAiProvider } = await import("./providers/openai");
  const { GoogleProvider } = await import("./providers/google");
  await loadProviderKeys(db);
  _orchestrator = new Orchestrator(db, [new AnthropicProvider(), new GoogleProvider(), new OpenAiProvider()]);
  return _orchestrator;
}
