import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, PageHeader, inputCls, btnCls } from "@/components/ui";
import { createVendorAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function VendorsPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  await requireUser();
  const { site: siteFilter } = await searchParams;
  const [vendors, sites] = await Promise.all([
    prisma.vendor.findMany({
      where: siteFilter ? { sites: { some: { siteId: siteFilter } } } : {},
      include: { sites: { include: { site: true } }, _count: { select: { performance: true, contracts: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.site.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendor Intelligence"
        subtitle={`${vendors.length} vendors`}
        action={
          <form method="GET" className="flex gap-2">
            <select name="site" defaultValue={siteFilter ?? ""} className={inputCls}>
              <option value="">All sites</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button className={btnCls}>Filter</button>
          </form>
        }
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {vendors.map((v) => (
          <Link key={v.id} href={`/vendors/${v.id}`} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow">
            <div className="font-semibold text-slate-900">{v.name}</div>
            <div className="text-xs text-slate-500">{v.category}</div>
            <div className="mt-2 text-xs text-slate-400">
              {v.sites.length} sites · {v._count.contracts} contracts · {v._count.performance} performance records
            </div>
          </Link>
        ))}
      </div>
      <Card title="Add a vendor">
        <form action={createVendorAction} className="grid gap-3 md:grid-cols-4">
          <input name="name" placeholder="Vendor name" required className={inputCls} />
          <input name="category" placeholder="Category" className={inputCls} />
          <select name="siteId" className={inputCls}>
            <option value="">No site yet</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button className={btnCls}>Add vendor</button>
        </form>
      </Card>
    </div>
  );
}
