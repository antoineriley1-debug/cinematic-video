import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAllSettings } from "@/lib/settings";
import { getOrchestrator } from "@/lib/ai/orchestrator";
import { Card, PageHeader, Badge, EmptyState, inputCls, btnCls, btnSecondaryCls, fmtDateTime } from "@/components/ui";
import { updateSettingAction, runHealthCheckAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();
  const [settings, orchestrator, auditRows, providerEvents, queue, users] = await Promise.all([
    getAllSettings(prisma),
    getOrchestrator(prisma),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.providerEvent.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
    prisma.aiQueueItem.findMany({ where: { status: "QUEUED" } }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
  ]);
  const statuses = orchestrator.providerStatuses();
  const actorName = (id: string | null) => users.find((u) => u.id === id)?.name ?? (id ? id.slice(0, 8) : "system");

  return (
    <div className="space-y-6">
      <PageHeader title="Administrator Console" subtitle="Provider health, configurable business rules, audit trail" />

      <Card
        title="AI Providers"
        action={
          <form action={runHealthCheckAction}>
            <button className={btnSecondaryCls}>Run health check</button>
          </form>
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
            <Badge tone="ATTENTION">BLOCKED_EXTERNAL</Badge> <strong>Anthropic / OpenAI keys</strong> — set
            ANTHROPIC_API_KEY / OPENAI_API_KEY in the server environment to activate live AI. Keys never reach the browser.
          </li>
          <li>
            <Badge tone="ATTENTION">BLOCKED_EXTERNAL</Badge> <strong>Plaud API sync</strong> — manual import works today;
            API credentials activate direct sync (adapter seam in src/lib/services/plaud.ts).
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
    </div>
  );
}
