import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hrefFor } from "@/lib/services/briefing";
import { Card, PageHeader, Badge, EmptyState, btnSecondaryCls, fmtDateTime, SourceLink } from "@/components/ui";
import { markNotificationReadAction, markAllNotificationsReadAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser();
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Notifications"
        subtitle="Mentions, attention flags, alerts, and system notices"
        action={
          <form action={markAllNotificationsReadAction}>
            <button className={btnSecondaryCls}>Mark all read</button>
          </form>
        }
      />
      <Card>
        {notifications.length === 0 ? (
          <EmptyState>No notifications.</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {notifications.map((n) => (
              <li key={n.id} className={`flex items-start gap-3 py-3 ${n.readAt ? "opacity-60" : ""}`}>
                <Badge tone={n.type === "ALERT" ? "CRITICAL" : n.type === "AI_CONTINUITY" ? "AI" : "INFO"}>
                  {n.type.replaceAll("_", " ")}
                </Badge>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900">{n.title}</div>
                  {n.body && <p className="text-sm text-slate-600">{n.body}</p>}
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-400">
                    {fmtDateTime(n.createdAt)}
                    {n.entityType && n.entityId && <SourceLink href={hrefFor(n.entityType, n.entityId)}>Open source →</SourceLink>}
                  </div>
                </div>
                {!n.readAt && (
                  <form action={markNotificationReadAction}>
                    <input type="hidden" name="id" value={n.id} />
                    <button className="text-xs text-slate-400 hover:text-slate-700">Mark read</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
