import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { directorTimeline } from "@/lib/services/directors";
import { DirectorFileClassifications } from "@/lib/validate";
import { Card, PageHeader, Badge, EmptyState, inputCls, btnCls, btnSecondaryCls, fmtDate } from "@/components/ui";
import { addDirectorFileEntryAction, recordInfractionAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function DirectorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const director = await prisma.director.findUnique({ where: { id }, include: { site: true } });
  if (!director) notFound();

  const [timeline, alerts] = await Promise.all([
    directorTimeline(prisma, id, user.id),
    prisma.alert.findMany({ where: { entityType: "DIRECTOR", entityId: id }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={director.name}
        help="director-file"
        subtitle={`${director.title ?? "Director"} · ${director.site?.name ?? "No site"}${director.email ? ` · ${director.email}` : ""}`}
        action={<a href={`/api/export/director/${director.id}`} className={btnSecondaryCls}>Export operational history</a>}
      />

      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a) => (
            <div key={a.id} className="rounded-xl border border-red-200 bg-red-50 p-4">
              <Badge tone="CRITICAL">{a.type.replaceAll("_", " ")}</Badge>
              <p className="mt-1 text-sm font-medium text-red-900">{a.title}</p>
              <p className="text-sm text-red-700">{a.body}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Add to Director File">
          <form action={addDirectorFileEntryAction} className="space-y-3">
            <input type="hidden" name="directorId" value={director.id} />
            <select name="classification" className={inputCls}>
              {DirectorFileClassifications.map((c) => (
                <option key={c} value={c}>{c.replaceAll("_", " ")}</option>
              ))}
            </select>
            <textarea name="content" rows={3} required placeholder="What happened, factually…" className={inputCls} />
            <select name="visibility" className={inputCls}>
              <option value="PRIVATE">Private — visible only to me (pattern detection sees metadata only)</option>
              <option value="SHARED">Shared — visible to authorized executives</option>
            </select>
            <button className={btnCls}>Add entry</button>
          </form>
        </Card>

        <Card title="Record Infraction">
          <form action={recordInfractionAction} className="space-y-3">
            <input type="hidden" name="directorId" value={director.id} />
            {director.siteId && <input type="hidden" name="siteId" value={director.siteId} />}
            <div className="grid grid-cols-2 gap-3">
              <input name="category" placeholder="Category (e.g. SAFETY)" required className={inputCls} />
              <select name="severity" className={inputCls}>
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
            </div>
            <textarea name="description" rows={2} required placeholder="Documented issue…" className={inputCls} />
            <input name="expectedCorrection" placeholder="Expected correction" className={inputCls} />
            <div>
              <label className="text-xs text-slate-500">Follow-up date</label>
              <input name="followUpDate" type="date" className={inputCls} />
            </div>
            <button className={btnCls}>Record infraction</button>
            <p className="text-xs text-slate-400">
              Infractions are formal records with full audit history. The executive alert threshold is configurable in
              the Admin Console.
            </p>
          </form>
        </Card>
      </div>

      <Card title="Director Timeline (authorized entries only)">
        {timeline.length === 0 ? (
          <EmptyState>No file entries or infractions yet.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {timeline.map((item) => (
              <li key={`${item.kind}-${(item.data as { id: string }).id}`} className="flex gap-3 text-sm">
                <span className="w-24 shrink-0 text-xs text-slate-400">{fmtDate(item.date)}</span>
                {item.kind === "INFRACTION" ? (
                  <div>
                    <Badge tone="CRITICAL">INFRACTION</Badge>
                    <Badge tone={(item.data as { severity: string }).severity}>{(item.data as { severity: string }).severity}</Badge>
                    <span className="ml-2 text-slate-800">{(item.data as { description: string }).description}</span>
                    <span className="ml-2 text-xs text-slate-400">status: {(item.data as { status: string }).status}</span>
                  </div>
                ) : (
                  <div>
                    <Badge tone={(item.data as { classification: string }).classification === "RECOGNITION" ? "POSITIVE" : "INFO"}>
                      {(item.data as { classification: string }).classification.replaceAll("_", " ")}
                    </Badge>
                    <span className="ml-2 text-slate-800">{(item.data as { content: string }).content}</span>
                    {(item.data as { sourceType?: string }).sourceType === "EMAIL" && (item.data as { sourceId?: string }).sourceId && (
                      <Link href={`/emails/${(item.data as { sourceId: string }).sourceId}`} className="ml-2 text-xs text-blue-600 hover:underline">
                        source email →
                      </Link>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
