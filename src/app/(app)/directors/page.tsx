import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, PageHeader, inputCls, btnCls } from "@/components/ui";
import { createDirectorAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function DirectorsPage() {
  await requireUser();
  const [directors, sites] = await Promise.all([
    prisma.director.findMany({ include: { site: true, _count: { select: { infractions: true, fileEntries: true } } }, orderBy: { name: "asc" } }),
    prisma.site.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Directors" subtitle={`${directors.length} director profiles`} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {directors.map((d) => (
          <Link key={d.id} href={`/directors/${d.id}`} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow">
            <div className="font-semibold text-slate-900">{d.name}</div>
            <div className="text-xs text-slate-500">{d.title}</div>
            <div className="mt-1 text-xs text-blue-600">{d.site?.name ?? "No site"}</div>
            <div className="mt-2 text-xs text-slate-400">
              {d._count.fileEntries} file entries · {d._count.infractions} infractions
            </div>
          </Link>
        ))}
      </div>
      <Card title="Add a director">
        <form action={createDirectorAction} className="grid gap-3 md:grid-cols-5">
          <input name="name" placeholder="Full name" required className={inputCls} />
          <input name="title" placeholder="Title" className={inputCls} />
          <input name="email" placeholder="Email" className={inputCls} />
          <select name="siteId" className={inputCls}>
            <option value="">No site</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button className={btnCls}>Add director</button>
        </form>
      </Card>
    </div>
  );
}
