import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { linksFor } from "@/lib/links";
import { hrefFor } from "@/lib/services/briefing";
import { ObservationCategories } from "@/lib/validate";
import { Card, PageHeader, Badge, EmptyState, inputCls, btnCls, btnSecondaryCls, fmtDate } from "@/components/ui";
import { addSiteObservationAction, startVisitAction, addCommentAction } from "../../actions";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  POSITIVE: "Positive Attributes",
  IMPROVEMENT: "Improvement Opportunities",
  TRAINING: "Training Needs",
  CRITICAL: "Critical Matters",
  PROJECT: "Project Observations",
  BACKBURNER: "Back Burner / Radar",
};

export default async function SitePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const site = await prisma.site.findUnique({
    where: { id },
    include: {
      directors: true,
      observations: { orderBy: { createdAt: "desc" } },
      visits: { orderBy: { startedAt: "desc" }, take: 10 },
      vendorSites: { include: { vendor: true } },
      contracts: { include: { contract: true } },
      projects: true,
      assignments: { include: { user: true } },
    },
  });
  if (!site) notFound();

  const [links, comments] = await Promise.all([
    linksFor(prisma, { type: "SITE", id }, { confirmedOnly: true }),
    prisma.comment.findMany({ where: { entityType: "SITE", entityId: id }, orderBy: { createdAt: "asc" } }),
  ]);
  const commentAuthors = await prisma.user.findMany({ where: { id: { in: comments.map((c) => c.authorId) } } });
  const authorName = (aid: string) => commentAuthors.find((u) => u.id === aid)?.name ?? "Unknown";
  const linkedEmails = links.filter((l) => l.other.type === "EMAIL");

  return (
    <div className="space-y-6">
      <PageHeader
        title={site.name}
        subtitle={`${site.code}${site.location ? ` · ${site.location}` : ""} · Executives: ${site.assignments.map((a) => a.user.name).join(", ") || "unassigned"}`}
        action={
          <div className="flex gap-2">
            <a href={`/api/export/site/${site.id}`} className={btnSecondaryCls}>Export report</a>
            <form action={startVisitAction}>
              <input type="hidden" name="siteId" value={site.id} />
              <button className={btnCls}>Start Site Visit</button>
            </form>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {ObservationCategories.map((category) => {
          const obs = site.observations.filter((o) => o.category === category);
          return (
            <Card key={category} title={CATEGORY_LABELS[category]}>
              {obs.length === 0 ? (
                <EmptyState>Nothing recorded.</EmptyState>
              ) : (
                <ul className="space-y-2">
                  {obs.slice(0, 8).map((o) => (
                    <li key={o.id} className="text-sm text-slate-700">
                      {o.content}
                      <span className="ml-2 text-xs text-slate-400">{fmtDate(o.createdAt)}{o.visitId ? " · site visit" : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
              <form action={addSiteObservationAction} className="mt-3 flex gap-2">
                <input type="hidden" name="siteId" value={site.id} />
                <input type="hidden" name="category" value={category} />
                <input name="content" placeholder={`Add to ${CATEGORY_LABELS[category].toLowerCase()}…`} required className={inputCls} />
                <button className={btnSecondaryCls}>Add</button>
              </form>
            </Card>
          );
        })}

        <Card title="Directors">
          {site.directors.length === 0 ? <EmptyState>No directors assigned.</EmptyState> : (
            <ul className="space-y-1">
              {site.directors.map((d) => (
                <li key={d.id}>
                  <Link href={`/directors/${d.id}`} className="text-sm font-medium text-blue-700 hover:underline">{d.name}</Link>
                  <span className="ml-2 text-xs text-slate-400">{d.title}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Vendors & Contracts">
          <div className="space-y-1 text-sm">
            {site.vendorSites.map((v) => (
              <div key={v.vendorId}>
                <Link href={`/vendors/${v.vendorId}`} className="font-medium text-blue-700 hover:underline">{v.vendor.name}</Link>
                <span className="ml-2 text-xs text-slate-400">vendor</span>
              </div>
            ))}
            {site.contracts.map((c) => (
              <div key={c.contractId}>
                <Link href={`/contracts/${c.contractId}`} className="font-medium text-blue-700 hover:underline">{c.contract.title}</Link>
                <span className="ml-2 text-xs text-slate-400">contract{c.contract.endDate ? ` · ends ${fmtDate(c.contract.endDate)}` : ""}</span>
              </div>
            ))}
            {site.vendorSites.length === 0 && site.contracts.length === 0 && <EmptyState>None linked.</EmptyState>}
          </div>
        </Card>

        <Card title="Projects">
          {site.projects.length === 0 ? <EmptyState>No projects.</EmptyState> : (
            <ul className="space-y-1 text-sm">
              {site.projects.map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  <Badge tone={p.status}>{p.status}</Badge>
                  <span className="text-slate-800">{p.name}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Site Visits">
          {site.visits.length === 0 ? <EmptyState>No visits recorded.</EmptyState> : (
            <ul className="space-y-1 text-sm">
              {site.visits.map((v) => (
                <li key={v.id}>
                  <Link href={`/visits/${v.id}`} className="text-blue-700 hover:underline">{fmtDate(v.startedAt)}</Link>
                  <Badge tone={v.status}>{v.status.replaceAll("_", " ")}</Badge>
                  {v.summary && <span className="ml-2 text-xs text-slate-500">{v.summary.slice(0, 80)}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Connected Emails & Records">
          {linkedEmails.length === 0 && links.length === 0 ? <EmptyState>Nothing connected yet.</EmptyState> : (
            <ul className="space-y-1 text-sm">
              {links.slice(0, 12).map((l) => (
                <li key={l.link.id}>
                  <Link href={hrefFor(l.other.type, l.other.id)} className="text-blue-700 hover:underline">
                    {l.other.type.toLowerCase()} record
                  </Link>
                  <span className="ml-2 text-xs text-slate-400">{l.link.kind}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Site Discussion">
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="text-sm">
              <span className="font-medium text-slate-900">{authorName(c.authorId)}</span>
              <span className="ml-2 text-xs text-slate-400">{fmtDate(c.createdAt)}</span>
              <p className="text-slate-700">{c.content}</p>
            </li>
          ))}
        </ul>
        <form action={addCommentAction} className="mt-3 flex gap-2">
          <input type="hidden" name="entityType" value="SITE" />
          <input type="hidden" name="entityId" value={site.id} />
          <input type="hidden" name="path" value={`/sites/${site.id}`} />
          <input name="content" placeholder="Comment — use @Name to direct attention" required className={inputCls} />
          <button className={btnCls}>Post</button>
        </form>
      </Card>
    </div>
  );
}
