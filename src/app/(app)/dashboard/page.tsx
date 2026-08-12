import Link from "next/link";
import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { contractWatch } from "@/lib/services/contracts";
import { parseJson } from "@/lib/validate";
import { Card, Badge, EmptyState, fmtDate, btnSecondaryCls } from "@/components/ui";
import { saveDashboardLayoutAction } from "../actions";

export const dynamic = "force-dynamic";

const PANEL_KEYS = [
  "priorities",
  "countdown",
  "attention",
  "critical",
  "intelligence",
  "projects",
  "siteHealth",
  "activity",
  "chief",
] as const;
type PanelKey = (typeof PANEL_KEYS)[number];

const PANEL_LABELS: Record<PanelKey, string> = {
  priorities: "Today's Priorities",
  countdown: "Countdown Center",
  attention: "My Attention",
  critical: "Critical Matters",
  intelligence: "Director & Vendor Intelligence",
  projects: "Projects",
  siteHealth: "Site Health",
  activity: "Recent Activity",
  chief: "AI Chief of Staff",
};

export default async function DashboardPage() {
  const user = await requireUser();
  const now = new Date();
  const [actions, criticals, watch, alerts, sites, recentActivity, myAttention, projects, dbUser] = await Promise.all([
    prisma.actionItem.findMany({
      where: { status: "OPEN", OR: [{ ownerId: user.id }, { createdById: user.id }] },
      orderBy: [{ dueDate: "asc" }],
      take: 8,
    }),
    prisma.siteObservation.findMany({ where: { category: "CRITICAL" }, include: { site: true }, orderBy: { createdAt: "desc" }, take: 6 }),
    contractWatch(prisma, user.id),
    prisma.alert.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
    prisma.site.findMany({ include: { _count: { select: { observations: true, directors: true, projects: true } } }, take: 12 }),
    prisma.activityEvent.findMany({ where: { userId: user.id }, orderBy: { occurredAt: "desc" }, take: 10 }),
    prisma.notification.findMany({ where: { userId: user.id, readAt: null, type: { in: ["MENTION", "ATTENTION"] } }, take: 6, orderBy: { createdAt: "desc" } }),
    prisma.project.findMany({ where: { status: { in: ["ACTIVE", "ON_HOLD"] } }, include: { site: true }, orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
  ]);

  const prefs = parseJson<{ dashboard?: { order?: string[]; hidden?: string[] } }>(dbUser.preferencesJson, {});
  const hidden = new Set((prefs.dashboard?.hidden ?? []).filter((k): k is PanelKey => (PANEL_KEYS as readonly string[]).includes(k)));
  const savedOrder = (prefs.dashboard?.order ?? []).filter((k): k is PanelKey => (PANEL_KEYS as readonly string[]).includes(k));
  const order: PanelKey[] = [...savedOrder, ...PANEL_KEYS.filter((k) => !savedOrder.includes(k))];

  const panels: Record<PanelKey, ReactNode> = {
    priorities: (
      <Card key="priorities" title={PANEL_LABELS.priorities}>
        {actions.length === 0 ? (
          <EmptyState>No open actions.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {actions.map((a) => {
              const overdue = a.dueDate && a.dueDate < now;
              return (
                <li key={a.id} className="flex items-center gap-2 text-sm">
                  <Badge tone={overdue ? "CRITICAL" : a.kind === "DEADLINE" ? "ATTENTION" : "OPEN"}>{a.kind}</Badge>
                  <span className="min-w-0 flex-1 truncate text-slate-800">{a.title}</span>
                  {a.dueDate && <span className={`text-xs ${overdue ? "font-semibold text-red-600" : "text-slate-400"}`}>{fmtDate(a.dueDate)}</span>}
                </li>
              );
            })}
          </ul>
        )}
        <Link href="/actions" className="mt-3 block text-xs font-medium text-blue-600 hover:underline">All actions &amp; deadlines →</Link>
      </Card>
    ),
    countdown: (
      <Card key="countdown" title={PANEL_LABELS.countdown}>
        {watch.length === 0 ? (
          <EmptyState>No deadlines inside the watch window.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {watch.slice(0, 6).map((w) => (
              <li key={`${w.contractId}:${w.kind}`} className="flex items-center gap-3 text-sm">
                <span className={`w-20 shrink-0 text-right font-bold ${w.daysRemaining <= 30 ? "text-red-600" : "text-slate-700"}`}>
                  {w.daysRemaining} days
                </span>
                <Link href={`/contracts/${w.contractId}`} className="min-w-0 flex-1 truncate text-slate-800 hover:underline">
                  {w.title}
                </Link>
                {w.acknowledged && <span className="text-xs text-slate-400">ack&apos;d</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    ),
    attention: (
      <Card key="attention" title={PANEL_LABELS.attention}>
        {myAttention.length === 0 ? (
          <EmptyState>No unread mentions or attention flags.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {myAttention.map((n) => (
              <li key={n.id} className="text-sm">
                <div className="font-medium text-slate-800">{n.title}</div>
                {n.body && <div className="truncate text-xs text-slate-500">{n.body}</div>}
              </li>
            ))}
          </ul>
        )}
        <Link href="/notifications" className="mt-3 block text-xs font-medium text-blue-600 hover:underline">All notifications →</Link>
      </Card>
    ),
    critical: (
      <Card key="critical" title={PANEL_LABELS.critical}>
        {criticals.length === 0 ? (
          <EmptyState>No open critical matters.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {criticals.map((c) => (
              <li key={c.id} className="text-sm">
                <Link href={`/sites/${c.siteId}`} className="font-medium text-red-700 hover:underline">
                  {c.site.name}
                </Link>
                <p className="text-slate-600">{c.content.slice(0, 120)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    ),
    intelligence: (
      <Card key="intelligence" title={PANEL_LABELS.intelligence}>
        {alerts.length === 0 ? (
          <EmptyState>No pattern or threshold alerts.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a) => (
              <li key={a.id} className="text-sm">
                <Badge tone="CRITICAL">{a.type.replaceAll("_", " ")}</Badge>
                <p className="mt-1 font-medium text-slate-800">{a.title}</p>
                <p className="text-xs text-slate-500">{a.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    ),
    projects: (
      <Card key="projects" title={PANEL_LABELS.projects}>
        {projects.length === 0 ? (
          <EmptyState>No active projects.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-sm">
                <Badge tone={p.priority}>{p.priority}</Badge>
                <span className="min-w-0 flex-1 truncate text-slate-800">{p.name}</span>
                {p.site && <span className="text-xs text-slate-400">{p.site.name}</span>}
              </li>
            ))}
          </ul>
        )}
        <Link href="/projects" className="mt-3 block text-xs font-medium text-blue-600 hover:underline">All projects →</Link>
      </Card>
    ),
    siteHealth: (
      <Card key="siteHealth" title={PANEL_LABELS.siteHealth}>
        <ul className="grid grid-cols-1 gap-1">
          {sites.map((s) => (
            <li key={s.id}>
              <Link href={`/sites/${s.id}`} className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-slate-50">
                <span className="text-slate-800">{s.name}</span>
                <span className="text-xs text-slate-400">
                  {s._count.directors} dir · {s._count.projects} proj
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    ),
    activity: (
      <Card key="activity" title={PANEL_LABELS.activity}>
        {recentActivity.length === 0 ? (
          <EmptyState>No activity yet.</EmptyState>
        ) : (
          <ul className="space-y-1.5">
            {recentActivity.map((e) => (
              <li key={e.id} className="text-sm text-slate-600">
                <span className="text-xs text-slate-400">{fmtDate(e.occurredAt)}</span> — {e.summary}
              </li>
            ))}
          </ul>
        )}
        <Link href="/calendar" className="mt-3 block text-xs font-medium text-blue-600 hover:underline">Full activity calendar →</Link>
      </Card>
    ),
    chief: (
      <Card key="chief" title={PANEL_LABELS.chief}>
        <p className="text-sm text-slate-600">
          Ask anything grounded in your authorized records: &ldquo;What needs my attention today?&rdquo;, &ldquo;What
          happened with this vendor last month?&rdquo;
        </p>
        <Link href="/chief" className="mt-3 inline-block rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
          Open Chief of Staff
        </Link>
      </Card>
    ),
  };

  const visible = order.filter((k) => !hidden.has(k));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Executive Intelligence Workspace</h1>
        <details className="text-right">
          <summary className={`${btnSecondaryCls} cursor-pointer list-none`}>Customize layout</summary>
          <form action={saveDashboardLayoutAction} className="mt-2 w-72 space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-lg">
            <p className="text-xs text-slate-500">Panel order (comma-separated) and visibility — saved for your account only.</p>
            <input
              name="order"
              defaultValue={order.join(",")}
              className="w-full rounded-lg border border-slate-300 px-2 py-1 text-xs"
            />
            {PANEL_KEYS.map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="hidden" value={k} defaultChecked={hidden.has(k)} />
                Hide {PANEL_LABELS[k]}
              </label>
            ))}
            <button className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">Save layout</button>
          </form>
        </details>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">{visible.map((k) => panels[k])}</div>
      {visible.length === 0 && (
        <Card><EmptyState>All panels are hidden — use Customize layout to bring them back.</EmptyState></Card>
      )}
    </div>
  );
}
