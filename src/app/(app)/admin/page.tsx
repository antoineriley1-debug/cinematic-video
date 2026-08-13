import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAllSettings } from "@/lib/settings";
import { getOrchestrator } from "@/lib/ai/orchestrator";
import { Card, PageHeader, Badge, EmptyState, inputCls, btnCls, btnSecondaryCls, fmtDateTime } from "@/components/ui";
import { plaudConfigSummary } from "@/lib/services/plaudClient";
import { updateSettingAction, runHealthCheckAction, processAiQueueAction, resetToMedstarDataAction, saveProviderKeyAction } from "../actions";
import { keyFor, keySource, keyFingerprint, type ProviderName } from "@/lib/ai/keys";
import { ConfirmButton } from "@/components/ConfirmButton";

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ keyResult?: string }> }) {
  await requireAdmin();
  const { keyResult } = await searchParams;
  const [settings, orchestrator, auditRows, providerEvents, queue, users] = await Promise.all([
    getAllSettings(prisma),
    getOrchestrator(prisma),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.providerEvent.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
    prisma.aiQueueItem.findMany({ where: { status: "QUEUED" } }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
  ]);
  const statuses = orchestrator.providerStatuses();
  const plaudSummary = plaudConfigSummary();
  const actorName = (id: string | null) => users.find((u) => u.id === id)?.name ?? (id ? id.slice(0, 8) : "system");

  return (
    <div className="space-y-6">
      <PageHeader title="Administrator Console" subtitle="Provider health, configurable business rules, audit trail" />

      <Card
        title="AI Providers"
        action={
          <div className="flex gap-2">
            <form action={runHealthCheckAction}>
              <button className={btnSecondaryCls}>Run health check</button>
            </form>
            {queue.length > 0 && (
              <form action={processAiQueueAction}>
                <button className={btnSecondaryCls}>Process queued AI work ({queue.length})</button>
              </form>
            )}
          </div>
        }
      >
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-400">
            <tr><th className="py-1">Provider</th><th>Configured</th><th>Health</th><th>Last error</th><th>Checked</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {statuses.map((s) => (
              <tr key={s.name}>
                <td className="py-2 font-medium">{s.name}</td>
                <td>{s.configured ? <Badge tone="POSITIVE">yes</Badge> : <Badge tone="CRITICAL">no key</Badge>}</td>
                <td>{s.healthy === null ? <Badge>unprobed</Badge> : s.healthy ? <Badge tone="POSITIVE">healthy</Badge> : <Badge tone="CRITICAL">down</Badge>}</td>
                <td className="text-xs text-slate-500">{s.lastError ?? "—"}</td>
                <td className="text-xs text-slate-500">{s.lastCheckedAt ? fmtDateTime(s.lastCheckedAt) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!orchestrator.aiAvailable() && (
          <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
            No AI provider is available. The deterministic Emergency Intelligence Engine is serving supported functions
            and AI work is queued ({queue.length} item{queue.length === 1 ? "" : "s"} waiting). Users cannot manually
            toggle this mode — it clears automatically when a provider recovers.
          </p>
        )}
      </Card>

      <Card title="AI provider keys">
        <p className="text-sm text-slate-600">
          Paste a key here to set it without redeploying — it is saved, tested, and the result is reported
          immediately. Keys entered here take precedence over the server environment. Surrounding quotes,
          spaces, line breaks, and masking dots are stripped automatically. Keys are never displayed again;
          the fingerprint identifies which key is stored without revealing it.
        </p>
        {keyResult && (
          <p className={`mt-3 rounded-lg p-3 text-sm ${/healthy|cleared/.test(keyResult) ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
            {keyResult}
          </p>
        )}
        <div className="mt-3 space-y-3">
          {(["anthropic", "google", "openai"] as ProviderName[]).map((provider) => (
            <form key={provider} action={saveProviderKeyAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="provider" value={provider} />
              <span className="w-24 text-sm font-medium capitalize">{provider}</span>
              <input
                name="key"
                type="password"
                autoComplete="off"
                placeholder={keySource(provider) === "none" ? "Paste API key" : "Paste a new key to replace"}
                className={`${inputCls} min-w-0 flex-1`}
              />
              <button className={btnSecondaryCls}>Save &amp; test</button>
              <span className="text-xs text-slate-500">
                source: {keySource(provider)}
                {keyFor(provider) ? ` · fingerprint ${keyFingerprint(keyFor(provider))}` : ""}
              </span>
            </form>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Submitting an empty field clears the app-stored key and falls back to the server environment.
        </p>
      </Card>

      <Card title="Provider events">
        {providerEvents.length === 0 ? <EmptyState>No events.</EmptyState> : (
          <ul className="space-y-1 text-sm">
            {providerEvents.map((e) => (
              <li key={e.id}>
                <Badge tone={e.event === "RECOVERED" ? "POSITIVE" : "CRITICAL"}>{e.event}</Badge>
                <span className="ml-2 font-medium">{e.provider}</span>
                <span className="ml-2 text-xs text-slate-500">{e.detail}</span>
                <span className="ml-2 text-xs text-slate-400">{fmtDateTime(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Business rules & settings (JSON values)">
        <div className="space-y-4">
          {Object.entries(settings).map(([key, value]) => (
            <form key={key} action={updateSettingAction} className="flex items-center gap-2">
              <label className="w-72 shrink-0 text-sm font-medium text-slate-700">{key}</label>
              <input type="hidden" name="key" value={key} />
              <input name="value" defaultValue={JSON.stringify(value)} className={inputCls} />
              <button className={btnSecondaryCls}>Save</button>
            </form>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          infraction.alertRule controls the executive-alert threshold (count, window, categories, severity floor,
          recipients, acknowledgement). contracts.watchWindowDays controls the renewal watch (default 90).
          emergency.* dictionaries drive Emergency Intelligence Mode.
        </p>
      </Card>

      <Card title="Audit log (latest 30)">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-400">
            <tr><th className="py-1">When</th><th>Actor</th><th>Action</th><th>Object</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {auditRows.map((row) => (
              <tr key={row.id}>
                <td className="py-1.5 text-xs text-slate-500">{fmtDateTime(row.createdAt)}</td>
                <td className="text-xs">{actorName(row.actorId)}</td>
                <td className="text-xs font-medium">{row.action}</td>
                <td className="text-xs text-slate-500">{row.entityType}:{row.entityId.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="External integrations">
        <ul className="space-y-2 text-sm text-slate-700">
          <li>
            <Badge tone="ATTENTION">BLOCKED_EXTERNAL</Badge> <strong>AI provider keys</strong> — set any of
            ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY in the server environment to activate live AI with
            automatic failover across whichever are configured. Keys never reach the browser.
          </li>
          <li>
            {plaudSummary.configured ? (
              <>
                <Badge tone="POSITIVE">CONFIGURED</Badge> <strong>Plaud Transcription API</strong> — credentials
                present ({plaudSummary.base}). The &ldquo;Transcribe with Plaud&rdquo; button appears on audio
                recordings; APP_BASE_URL must be set so Plaud can fetch the signed audio URL.
              </>
            ) : (
              <>
                <Badge tone="ATTENTION">BLOCKED_EXTERNAL</Badge> <strong>Plaud Transcription API</strong> — audio
                drag-and-drop works today; set PLAUD_CLIENT_ID + PLAUD_CLIENT_SECRET (from portal.plaud.ai) and
                APP_BASE_URL to enable automatic speaker-attributed transcription. Device sync (Embedded SDK)
                requires a mobile app — deferred.
              </>
            )}
          </li>
          <li>
            <Badge tone="ATTENTION">BLOCKED_EXTERNAL</Badge> <strong>Email intake address (Method B)</strong> — requires
            inbound-mail infrastructure; set EMAIL_INTAKE_ADDRESS once provisioned. Drag-and-drop (Method A) is live.
          </li>
          <li>
            <Badge tone="ATTENTION">BLOCKED_EXTERNAL</Badge> <strong>Voice provider</strong> — set VOICE_PROVIDER /
            VOICE_API_KEY to enable natural-voice narration in the Training Center.
          </li>
        </ul>
      </Card>

      <Card title="Danger zone — reset all data">
        <p className="text-sm text-slate-600">
          Deletes <strong>every record</strong> (emails, meetings, notes, projects, users — everything) and reloads
          the production dataset: the 10 MedStar hospitals with their facilities directors and the admin account.
          You will be signed out; log back in as <strong>antoine.riley.1@gmail.com</strong>.
        </p>
        <form action={resetToMedstarDataAction} className="mt-3 flex gap-3">
          <input name="confirmPhrase" placeholder="Type RESET ALL DATA to confirm" required className={inputCls} />
          <ConfirmButton
            message="This permanently deletes ALL data and reloads the MedStar dataset. There is no undo. Continue?"
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Wipe &amp; load MedStar data
          </ConfirmButton>
        </form>
      </Card>
    </div>
  );
}
