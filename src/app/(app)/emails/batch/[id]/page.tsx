import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildTimeline } from "@/lib/services/emails";
import { Card, PageHeader, Badge, btnSecondaryCls, fmtDate } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function EmailBatchPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const batch = await prisma.emailBatch.findUnique({ where: { id } });
  if (!batch) notFound();
  const timeline = await buildTimeline(prisma, { batchId: id });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={batch.title ?? "Email Timeline"}
        subtitle={`${timeline.length} emails, ordered chronologically — reconstruct what happened`}
        action={<a href={`/api/export/email-timeline/${batch.id}`} className={btnSecondaryCls}>Export chronology</a>}
      />
      <div className="relative space-y-6 border-l-2 border-slate-200 pl-6">
        {timeline.map((entry) => (
          <Card key={entry.emailId}>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900">{fmtDate(entry.date)}</span>
              <span className="text-slate-500">—</span>
              <span className="font-medium text-slate-800">{entry.sender}</span>
              {entry.urgency && <Badge tone={entry.urgency}>{entry.urgency}</Badge>}
            </div>
            <div className="mt-1 text-sm text-slate-500">Subject: {entry.subject}</div>
            {entry.recipients.length > 0 && <div className="text-xs text-slate-400">To: {entry.recipients.join(", ")}</div>}
            {entry.event && <p className="mt-2 text-sm text-slate-700">{entry.event}</p>}
            {entry.bullets.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-sm text-slate-600">
                {entry.bullets.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            )}
            {entry.actions.length > 0 && (
              <div className="mt-2 text-sm">
                <span className="text-xs font-semibold uppercase text-slate-400">Actions / commitments</span>
                <ul className="list-disc pl-5 text-slate-600">{entry.actions.map((a, i) => <li key={i}>{a}</li>)}</ul>
              </div>
            )}
            <Link href={`/emails/${entry.emailId}`} className="mt-2 inline-block text-xs font-medium text-blue-600 hover:underline">
              Open source email →
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
