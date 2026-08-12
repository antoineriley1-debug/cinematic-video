import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, PageHeader, inputCls, btnCls } from "@/components/ui";
import { createSiteAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function SitesPage() {
  await requireUser();
  const sites = await prisma.site.findMany({
    include: { _count: { select: { directors: true, projects: true, observations: true, visits: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Sites & Hospitals" subtitle={`${sites.length} sites under management`} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sites.map((s) => (
          <Link key={s.id} href={`/sites/${s.id}`} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow">
            <div className="text-xs font-semibold text-blue-600">{s.code}</div>
            <div className="mt-1 font-semibold text-slate-900">{s.name}</div>
            <div className="mt-1 text-xs text-slate-500">{s.location ?? ""}</div>
            <div className="mt-3 flex gap-4 text-xs text-slate-500">
              <span>{s._count.directors} directors</span>
              <span>{s._count.projects} projects</span>
              <span>{s._count.visits} visits</span>
            </div>
          </Link>
        ))}
      </div>
      <Card title="Add a site">
        <form action={createSiteAction} className="grid gap-3 md:grid-cols-4">
          <input name="name" placeholder="Site name" required className={inputCls} />
          <input name="code" placeholder="Code (e.g. MGH)" required className={inputCls} />
          <input name="location" placeholder="Location" className={inputCls} />
          <button className={btnCls}>Add site</button>
        </form>
      </Card>
    </div>
  );
}
