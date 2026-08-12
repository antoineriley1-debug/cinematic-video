import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { searchAll } from "@/lib/search";
import { Card, PageHeader, Badge, EmptyState, inputCls, btnCls, fmtDate } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const { q } = await searchParams;
  const hits = q ? await searchAll(prisma, user.id, q, 10) : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Enterprise Search" subtitle="Searches only what you're authorized to see — private records of other executives are excluded at the query level." />
      <form method="GET" className="flex gap-2">
        <input name="q" defaultValue={q ?? ""} placeholder="Search sites, directors, vendors, contracts, projects, emails, meetings, notes, actions…" className={inputCls} autoFocus />
        <button className={btnCls}>Search</button>
      </form>
      {q && (
        <Card title={`${hits.length} results for "${q}"`}>
          {hits.length === 0 ? (
            <EmptyState>Nothing found.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {hits.map((h) => (
                <li key={`${h.type}:${h.id}`} className="py-2">
                  <div className="flex items-center gap-2">
                    <Badge tone="INFO">{h.type}</Badge>
                    <Link href={h.href} className="font-medium text-slate-900 hover:underline">{h.title}</Link>
                    {h.date && <span className="text-xs text-slate-400">{fmtDate(h.date)}</span>}
                  </div>
                  {h.snippet && <p className="mt-0.5 text-sm text-slate-500">{h.snippet}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
