import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, PageHeader, EmptyState, ModeBadge, inputCls, btnCls, fmtDate } from "@/components/ui";
import { importPlaudAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function PlaudPage() {
  await requireUser();
  const recordings = await prisma.plaudRecording.findMany({ orderBy: { createdAt: "desc" }, take: 30 });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plaud Recordings"
        help="plaud"
        subtitle="Plaud is the designated recording source. Import transcripts here; direct Plaud API sync activates when credentials are configured (Admin Console)."
      />

      <Card title="Import a recording transcript">
        <form action={importPlaudAction} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <input name="title" placeholder="Recording title" required className={inputCls} />
            <div>
              <label className="text-xs text-slate-500">Recorded on</label>
              <input name="recordedAt" type="date" className={inputCls} />
            </div>
          </div>
          <input name="file" type="file" accept=".txt,text/plain" className={inputCls} />
          <textarea name="transcript" rows={6} placeholder="…or paste the transcript" className={inputCls} />
          <button className={btnCls}>Import &amp; analyze</button>
          <p className="text-xs text-slate-400">
            Sensitive classifications (e.g. discipline) always require human confirmation — AI analysis of a recording
            never becomes a formal employee record by itself.
          </p>
        </form>
      </Card>

      <Card title="Recordings">
        {recordings.length === 0 ? <EmptyState>No recordings imported.</EmptyState> : (
          <ul className="divide-y divide-slate-100">
            {recordings.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <Link href={`/plaud/${r.id}`} className="font-medium text-slate-900 hover:underline">{r.title}</Link>
                  <div className="text-xs text-slate-500">{fmtDate(r.recordedAt ?? r.createdAt)}</div>
                </div>
                <ModeBadge mode={r.analysisMode} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
