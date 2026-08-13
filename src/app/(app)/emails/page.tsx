import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, PageHeader, Badge, EmptyState, ModeBadge, inputCls, btnCls, fmtDateTime } from "@/components/ui";
import { ingestEmailAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function EmailsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireUser();
  const { error } = await searchParams;
  const [emails, batches] = await Promise.all([
    prisma.emailMessage.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.emailBatch.findMany({ include: { _count: { select: { emails: true } } }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email Intelligence"
        help="email-intelligence"
        subtitle="Drag-and-drop or paste emails you choose to submit. Crothall Executive OS never logs into or syncs your corporate inbox."
      />

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          That upload didn&apos;t go through: {error}
        </p>
      )}

      <Card title="Submit emails">
        <form action={ingestEmailAction} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Email files (.eml / .txt) — select multiple to build a chronological timeline
            </label>
            <input name="files" type="file" multiple accept=".eml,.txt,message/rfc822,text/plain" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">…or paste email content</label>
            <textarea name="pasted" rows={5} placeholder={"From: sender@example.com\nSubject: …\n\nBody…"} className={inputCls} />
          </div>
          <div className="flex gap-3">
            <input name="batchTitle" placeholder="Timeline title (used when uploading multiple emails)" className={inputCls} />
            <button className={btnCls}>Analyze</button>
          </div>
          <p className="text-xs text-slate-400">
            Originals are preserved verbatim. Duplicates are detected automatically. If AI providers are down, the
            deterministic Emergency Intelligence Engine takes over and AI-quality analysis is queued — nothing is lost.
          </p>
        </form>
      </Card>

      {batches.length > 0 && (
        <Card title="Email timelines (batches)">
          <ul className="space-y-1 text-sm">
            {batches.map((b) => (
              <li key={b.id}>
                <Link href={`/emails/batch/${b.id}`} className="font-medium text-blue-700 hover:underline">
                  {b.title ?? "Untitled batch"}
                </Link>
                <span className="ml-2 text-xs text-slate-400">{b._count.emails} emails · {fmtDateTime(b.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Recent emails">
        {emails.length === 0 ? (
          <EmptyState>No emails submitted yet.</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {emails.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <Link href={`/emails/${e.id}`} className="font-medium text-slate-900 hover:underline">
                    {e.subject ?? "(no subject)"}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {e.fromName || e.fromAddress} · {fmtDateTime(e.sentAt ?? e.createdAt)}
                  </div>
                </div>
                {e.urgency && <Badge tone={e.urgency}>{e.urgency}</Badge>}
                <ModeBadge mode={e.analysisMode} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
