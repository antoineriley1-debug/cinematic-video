import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseJson, DirectorFileClassifications } from "@/lib/validate";
import { Card, PageHeader, EmptyState, ModeBadge, inputCls, btnCls, fmtDate } from "@/components/ui";
import { addDirectorFileEntryAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function PlaudRecordingPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const recording = await prisma.plaudRecording.findUnique({ where: { id } });
  if (!recording) notFound();
  const directors = await prisma.director.findMany({ orderBy: { name: "asc" } });
  const decisions = parseJson<string[]>(recording.decisionsJson, []);
  const actions = parseJson<{ title: string }[]>(recording.actionsJson, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={recording.title}
        subtitle={fmtDate(recording.recordedAt ?? recording.createdAt)}
        action={<ModeBadge mode={recording.analysisMode} />}
      />

      <Card title="Summary">
        <p className="text-sm text-slate-700">{recording.summary ?? "Analysis pending."}</p>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title={`Decisions (${decisions.length})`}>
          {decisions.length === 0 ? <EmptyState>None.</EmptyState> : (
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{decisions.map((d, i) => <li key={i}>{d}</li>)}</ul>
          )}
        </Card>
        <Card title={`Actions & commitments (${actions.length})`}>
          {actions.length === 0 ? <EmptyState>None.</EmptyState> : (
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{actions.map((a, i) => <li key={i}>{a.title}</li>)}</ul>
          )}
        </Card>
      </div>

      <Card title="Add to Director File (human confirmation required)">
        <form action={addDirectorFileEntryAction} className="grid gap-3 md:grid-cols-4">
          <input type="hidden" name="sourceType" value="PLAUD" />
          <input type="hidden" name="sourceId" value={recording.id} />
          <select name="directorId" required className={inputCls}>
            <option value="">Select director…</option>
            {directors.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <select name="classification" className={inputCls}>
            {DirectorFileClassifications.map((c) => (
              <option key={c} value={c}>{c.replaceAll("_", " ")}</option>
            ))}
          </select>
          <input name="content" placeholder="File entry note" required className={inputCls} />
          <button className={btnCls}>Add to file</button>
        </form>
      </Card>

      <Card title="Transcript (preserved)">
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{recording.transcript}</pre>
      </Card>
    </div>
  );
}
