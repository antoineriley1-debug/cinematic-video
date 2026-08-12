import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { linksFor } from "@/lib/links";
import { hrefFor } from "@/lib/services/briefing";
import { daysUntil } from "@/lib/services/contracts";
import { Card, PageHeader, Badge, EmptyState, inputCls, btnCls, fmtDate } from "@/components/ui";
import { addCommentAction, ackContractWatchAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const contract = await prisma.contract.findUnique({
    where: { id },
    include: { vendor: true, sites: { include: { site: true } } },
  });
  if (!contract) notFound();

  const [links, comments, concerns, acks] = await Promise.all([
    linksFor(prisma, { type: "CONTRACT", id }, { confirmedOnly: true }),
    prisma.comment.findMany({ where: { entityType: "CONTRACT", entityId: id }, orderBy: { createdAt: "asc" } }),
    contract.vendorId
      ? prisma.vendorPerformanceRecord.findMany({ where: { vendorId: contract.vendorId, type: { in: ["CONCERN", "CONTRACT_CONCERN", "ESCALATION", "MISSED_DEADLINE"] } }, orderBy: { createdAt: "desc" }, take: 10 })
      : Promise.resolve([]),
    prisma.acknowledgement.findMany({ where: { userId: user.id, itemType: "CONTRACT_WATCH" } }),
  ]);
  const commentAuthors = await prisma.user.findMany({ where: { id: { in: comments.map((c) => c.authorId) } } });
  const authorName = (aid: string) => commentAuthors.find((u) => u.id === aid)?.name ?? "Unknown";
  const ackSet = new Set(acks.map((a) => a.itemId));

  const deadlines = [
    { kind: "EXPIRATION", date: contract.endDate },
    { kind: "RENEWAL", date: contract.renewalDate },
    { kind: "NOTICE_DEADLINE", date: contract.noticeDeadline },
  ].filter((d): d is { kind: string; date: Date } => Boolean(d.date));

  return (
    <div className="space-y-6">
      <PageHeader
        title={contract.title}
        subtitle={`${contract.vendor ? contract.vendor.name + " · " : ""}${contract.sites.map((s) => s.site.name).join(", ") || "no sites"} · ${contract.status}${contract.autoRenews ? " · auto-renews" : ""}`}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {deadlines.map((d) => {
          const days = daysUntil(d.date);
          const acked = ackSet.has(`${contract.id}:${d.kind}`);
          return (
            <Card key={d.kind} title={d.kind.replaceAll("_", " ")}>
              <div className={`text-3xl font-bold ${days <= 30 ? "text-red-600" : days <= 60 ? "text-orange-600" : "text-slate-800"}`}>
                {days >= 0 ? `${days} DAYS` : "PASSED"}
              </div>
              <div className="mt-1 text-sm text-slate-500">{fmtDate(d.date)}</div>
              {days >= 0 && !acked && (
                <form action={ackContractWatchAction} className="mt-3">
                  <input type="hidden" name="contractId" value={contract.id} />
                  <input type="hidden" name="kind" value={d.kind} />
                  <button className="text-xs text-slate-500 underline" title="Removes this from your recurring daily briefing only. The deadline remains here and on the deadline dashboard.">
                    Acknowledge for my briefing
                  </button>
                </form>
              )}
              {acked && <div className="mt-2"><Badge tone="INFO">acknowledged by you</Badge></div>}
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Contract terms (AI-searchable)">
          {contract.terms ? (
            <p className="whitespace-pre-wrap text-sm text-slate-700">{contract.terms}</p>
          ) : (
            <EmptyState>No terms captured. Paste terms to enable grounded AI answers.</EmptyState>
          )}
          <Link href={`/chief?prefill=${encodeURIComponent(`What does the contract "${contract.title}" require?`)}`} className="mt-3 inline-block text-xs font-medium text-blue-600 hover:underline">
            Ask the AI Chief of Staff about this contract →
          </Link>
        </Card>

        <Card title="Documented vendor concerns against this contract's vendor">
          {concerns.length === 0 ? (
            <EmptyState>No open concerns documented.</EmptyState>
          ) : (
            <ul className="space-y-2 text-sm">
              {concerns.map((c) => (
                <li key={c.id}>
                  <Badge tone="HIGH">{c.type.replaceAll("_", " ")}</Badge>
                  <span className="ml-2 text-slate-700">{c.content}</span>
                  <span className="ml-2 text-xs text-slate-400">{fmtDate(c.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Connected records">
        {links.length === 0 ? <EmptyState>Nothing connected yet.</EmptyState> : (
          <ul className="space-y-1 text-sm">
            {links.map((l) => (
              <li key={l.link.id}>
                <Link href={hrefFor(l.other.type, l.other.id)} className="text-blue-700 hover:underline">
                  linked {l.other.type.toLowerCase()} record
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Contract Discussion">
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
          <input type="hidden" name="entityType" value="CONTRACT" />
          <input type="hidden" name="entityId" value={contract.id} />
          <input type="hidden" name="path" value={`/contracts/${contract.id}`} />
          <input name="content" placeholder="Comment — use @Name to direct attention" required className={inputCls} />
          <button className={btnCls}>Post</button>
        </form>
      </Card>
    </div>
  );
}
