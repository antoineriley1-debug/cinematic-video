import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { linksFor } from "@/lib/links";
import { hrefFor } from "@/lib/services/briefing";
import { VendorPerformanceTypes } from "@/lib/validate";
import { Card, PageHeader, Badge, EmptyState, inputCls, btnCls, btnSecondaryCls, fmtDate } from "@/components/ui";
import { recordVendorPerformanceAction, addCommentAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function VendorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const vendor = await prisma.vendor.findUnique({
    where: { id },
    include: {
      sites: { include: { site: true } },
      contracts: true,
      performance: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!vendor) notFound();

  const [alerts, links, comments, sites] = await Promise.all([
    prisma.alert.findMany({ where: { entityType: "VENDOR", entityId: id }, orderBy: { createdAt: "desc" } }),
    linksFor(prisma, { type: "VENDOR", id }, { confirmedOnly: true }),
    prisma.comment.findMany({ where: { entityType: "VENDOR", entityId: id }, orderBy: { createdAt: "asc" } }),
    prisma.site.findMany({ orderBy: { name: "asc" } }),
  ]);
  const commentAuthors = await prisma.user.findMany({ where: { id: { in: comments.map((c) => c.authorId) } } });
  const authorName = (aid: string) => commentAuthors.find((u) => u.id === aid)?.name ?? "Unknown";

  return (
    <div className="space-y-6">
      <PageHeader
        title={vendor.name}
        subtitle={`${vendor.category ?? "Vendor"} · serves ${vendor.sites.map((s) => s.site.name).join(", ") || "no sites yet"}`}
        action={<a href={`/api/export/vendor/${vendor.id}`} className={btnSecondaryCls}>Export report</a>}
      />

      {alerts.map((a) => (
        <div key={a.id} className="rounded-xl border border-red-200 bg-red-50 p-4">
          <Badge tone="CRITICAL">VENDOR PATTERN ALERT</Badge>
          <p className="mt-1 text-sm font-medium text-red-900">{a.title}</p>
          <p className="text-sm text-red-700">{a.body}</p>
        </div>
      ))}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Document Performance">
          <form action={recordVendorPerformanceAction} className="space-y-3">
            <input type="hidden" name="vendorId" value={vendor.id} />
            <div className="grid grid-cols-2 gap-3">
              <select name="type" className={inputCls}>
                {VendorPerformanceTypes.map((t) => (
                  <option key={t} value={t}>{t.replaceAll("_", " ")}</option>
                ))}
              </select>
              <select name="siteId" className={inputCls}>
                <option value="">No specific site</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <textarea name="content" rows={3} required placeholder="What happened, factually…" className={inputCls} />
            <button className={btnCls}>Record</button>
            <p className="text-xs text-slate-400">
              Recurring problems across multiple sites automatically raise a Vendor Pattern Alert with supporting evidence.
            </p>
          </form>
        </Card>

        <Card title="Contracts & Connections">
          <ul className="space-y-1 text-sm">
            {vendor.contracts.map((c) => (
              <li key={c.id}>
                <Link href={`/contracts/${c.id}`} className="font-medium text-blue-700 hover:underline">{c.title}</Link>
                {c.endDate && <span className="ml-2 text-xs text-slate-400">ends {fmtDate(c.endDate)}</span>}
              </li>
            ))}
            {links.map((l) => (
              <li key={l.link.id}>
                <Link href={hrefFor(l.other.type, l.other.id)} className="text-blue-700 hover:underline">
                  linked {l.other.type.toLowerCase()}
                </Link>
              </li>
            ))}
            {vendor.contracts.length === 0 && links.length === 0 && <EmptyState>Nothing connected.</EmptyState>}
          </ul>
        </Card>
      </div>

      <Card title="Performance History & Timeline">
        {vendor.performance.length === 0 ? (
          <EmptyState>No performance records.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {vendor.performance.map((p) => (
              <li key={p.id} className="flex items-start gap-3 text-sm">
                <span className="w-24 shrink-0 text-xs text-slate-400">{fmtDate(p.createdAt)}</span>
                <Badge tone={p.type === "POSITIVE" || p.type === "RESOLUTION" ? "POSITIVE" : "HIGH"}>{p.type.replaceAll("_", " ")}</Badge>
                <span className="text-slate-700">{p.content}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Vendor Discussion (public — supports @mentions and replies)">
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
          <input type="hidden" name="entityType" value="VENDOR" />
          <input type="hidden" name="entityId" value={vendor.id} />
          <input type="hidden" name="path" value={`/vendors/${vendor.id}`} />
          <input name="content" placeholder="Comment — use @Name to direct attention" required className={inputCls} />
          <button className={btnCls}>Post</button>
        </form>
      </Card>
    </div>
  );
}
