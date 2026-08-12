import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { contractWatch } from "@/lib/services/contracts";
import { Card, Badge, EmptyState, fmtDate } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const now = new Date();
  const [actions, criticals, watch, alerts, sites, recentActivity, myAttention, projects] = await Promise.all([
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
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Executive Intelligence Workspace</h1>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Today's Priorities">
          {actions.length === 0 ? (
            <EmptyState>No open actions.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {actions.map((a) => {
                const overdue = a.dueDate && a.dueDate < now;
                return (
                  <li key={a.id} className="flex items-center gap-2 text-sm">
                    <Badge tone={overdue ? "CRITICAL" : a.kind === "DEADLINE" ? "ATTENTION" : "OPEN"}>
                      {a.kind}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-slate-800">{a.title}</span>
                    {a.dueDate && <span className={`text-xs ${overdue ? "font-semibold text-red-600" : "text-slate-400"}`}>{fmtDate(a.dueDate)}</span>}
                  </li>
                );
              })}
            </ul>
          )}
          <Link href="/actions" className="mt-3 block text-xs font-medium text-blue-600 hover:underline">All actions &amp; deadlines →</Link>
        </Card>

        <Card title="Countdown Center">
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

        <Card title="My Attention">
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

        <Card title="Critical Matters">
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

        <Card title="Director & Vendor Intelligence">
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

        <Card title="Projects">
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

        <Card title="Site Health">
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

        <Card title="Recent Activity">
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

        <Card title="AI Chief of Staff">
          <p className="text-sm text-slate-600">
            Ask anything grounded in your authorized records: &ldquo;What needs my attention today?&rdquo;, &ldquo;What
            happened with this vendor last month?&rdquo;
          </p>
          <Link href="/chief" className="mt-3 inline-block rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
            Open Chief of Staff
          </Link>
        </Card>
      </div>
    </div>
  );
}
