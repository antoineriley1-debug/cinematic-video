import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/validate";
import { Card, PageHeader, EmptyState, ModeBadge, btnSecondaryCls, fmtDate, SourceLink } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const meeting = await prisma.meeting.findUnique({ where: { id } });
  if (!meeting) notFound();
  const actions = await prisma.actionItem.findMany({ where: { sourceType: "MEETING", sourceId: id } });

  const decisions = parseJson<string[]>(meeting.decisionsJson, []);
  const unresolved = parseJson<string[]>(meeting.unresolvedJson, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={meeting.title}
        subtitle={`${fmtDate(meeting.heldAt ?? meeting.createdAt)}`}
        action={
          <div className="flex items-center gap-2">
            <ModeBadge mode={meeting.analysisMode} />
            <a href={`/api/export/meeting/${meeting.id}`} className={btnSecondaryCls}>Export report</a>
          </div>
        }
      />

      <Card title="Summary">
        <p className="text-sm text-slate-700">{meeting.summary ?? "Analysis pending."}</p>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title={`Decisions (${decisions.length})`}>
          {decisions.length === 0 ? <EmptyState>None extracted.</EmptyState> : (
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{decisions.map((d, i) => <li key={i}>{d}</li>)}</ul>
          )}
        </Card>
        <Card title={`Unresolved matters (${unresolved.length})`}>
          {unresolved.length === 0 ? <EmptyState>None extracted.</EmptyState> : (
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{unresolved.map((u, i) => <li key={i}>{u}</li>)}</ul>
          )}
        </Card>
      </div>

      <Card title={`Extracted actions (${actions.length}) — live action items`}>
        {actions.length === 0 ? <EmptyState>No actions extracted.</EmptyState> : (
          <ul className="space-y-1 text-sm">
            {actions.map((a) => (
              <li key={a.id} className="text-slate-700">
                • {a.title} {a.details && <span className="text-xs text-slate-400">({a.details})</span>}
                {a.dueDate && <span className="ml-1 text-xs text-orange-600">due {fmtDate(a.dueDate)}</span>}
              </li>
            ))}
          </ul>
        )}
        <SourceLink href="/actions">Manage on the actions dashboard</SourceLink>
      </Card>

      <Card title="Original minutes (preserved)">
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{meeting.minutesText}</pre>
      </Card>
    </div>
  );
}
