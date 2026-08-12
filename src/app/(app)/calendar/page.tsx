import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hrefFor } from "@/lib/services/briefing";
import { Card, PageHeader, Badge, EmptyState, btnSecondaryCls, SourceLink } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const user = await requireUser();
  const { days: daysParam } = await searchParams;
  const days = Math.min(Math.max(parseInt(daysParam ?? "14", 10) || 14, 1), 90);
  const from = new Date(Date.now() - days * 24 * 3600 * 1000);
  const events = await prisma.activityEvent.findMany({
    where: { userId: user.id, occurredAt: { gte: from } },
    orderBy: { occurredAt: "desc" },
  });

  const byDay = new Map<string, typeof events>();
  for (const e of events) {
    const key = e.occurredAt.toISOString().slice(0, 10);
    byDay.set(key, [...(byDay.get(key) ?? []), e]);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Executive Activity Calendar"
        subtitle={`Reconstruct your last ${days} days. Every meaningful action in Crothall Executive OS lands here, and the AI Chief of Staff can use it as context.`}
        action={
          <div className="flex gap-2">
            {[7, 14, 30, 90].map((d) => (
              <a key={d} href={`/calendar?days=${d}`} className={btnSecondaryCls}>{d}d</a>
            ))}
            <a href={`/api/export/activity?days=${days}`} className={btnSecondaryCls}>Export</a>
          </div>
        }
      />
      {byDay.size === 0 ? (
        <Card><EmptyState>No activity in this window.</EmptyState></Card>
      ) : (
        [...byDay.entries()].map(([day, dayEvents]) => (
          <Card key={day} title={new Date(day + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}>
            <ul className="space-y-2">
              {dayEvents.map((e) => (
                <li key={e.id} className="flex items-center gap-3 text-sm">
                  <span className="w-14 shrink-0 text-xs text-slate-400">
                    {e.occurredAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </span>
                  <Badge tone="INFO">{e.type.replaceAll("_", " ")}</Badge>
                  <span className="min-w-0 flex-1 text-slate-700">{e.summary}</span>
                  {e.entityType && e.entityId && <SourceLink href={hrefFor(e.entityType, e.entityId)} />}
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
