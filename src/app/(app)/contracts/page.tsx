import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { contractWatch } from "@/lib/services/contracts";
import { Card, PageHeader, Badge, EmptyState, inputCls, btnCls, fmtDate } from "@/components/ui";
import { createContractAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ContractsPage() {
  const user = await requireUser();
  const [contracts, watch, vendors, sites] = await Promise.all([
    prisma.contract.findMany({ include: { vendor: true, sites: { include: { site: true } } }, orderBy: { endDate: "asc" } }),
    contractWatch(prisma, user.id),
    prisma.vendor.findMany({ orderBy: { name: "asc" } }),
    prisma.site.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Contracts"
        help="contract-search" subtitle={`${contracts.length} contracts · ${watch.length} inside the renewal watch window`} />

      {watch.length > 0 && (
        <Card title="Renewal Watch">
          <ul className="space-y-2">
            {watch.map((w) => (
              <li key={`${w.contractId}:${w.kind}`} className="flex items-center gap-3 text-sm">
                <span className={`w-20 shrink-0 text-right font-bold ${w.daysRemaining <= 30 ? "text-red-600" : "text-slate-700"}`}>
                  {w.daysRemaining} DAYS
                </span>
                <Link href={`/contracts/${w.contractId}`} className="min-w-0 flex-1 truncate font-medium text-slate-800 hover:underline">
                  {w.title}
                </Link>
                <span className="text-xs text-slate-400">{w.kind.replaceAll("_", " ")} · {fmtDate(w.date)}</span>
                {w.acknowledged && <Badge tone="INFO">acknowledged</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="All contracts">
        {contracts.length === 0 ? (
          <EmptyState>No contracts.</EmptyState>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2">Contract</th>
                <th>Vendor</th>
                <th>Sites</th>
                <th>Ends</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contracts.map((c) => (
                <tr key={c.id}>
                  <td className="py-2">
                    <Link href={`/contracts/${c.id}`} className="font-medium text-blue-700 hover:underline">{c.title}</Link>
                  </td>
                  <td>{c.vendor ? <Link href={`/vendors/${c.vendorId}`} className="hover:underline">{c.vendor.name}</Link> : "—"}</td>
                  <td className="text-xs text-slate-500">{c.sites.map((s) => s.site.code).join(", ") || "—"}</td>
                  <td className="text-xs">{fmtDate(c.endDate)}</td>
                  <td><Badge tone={c.status}>{c.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Add a contract">
        <form action={createContractAction} className="grid gap-3 md:grid-cols-2">
          <input name="title" placeholder="Contract title" required className={inputCls} />
          <select name="vendorId" className={inputCls}>
            <option value="">No vendor</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
          <select name="siteId" className={inputCls}>
            <option value="">No site</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <input name="description" placeholder="Description" className={inputCls} />
          <div>
            <label className="text-xs text-slate-500">End date</label>
            <input name="endDate" type="date" className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-slate-500">Renewal date</label>
            <input name="renewalDate" type="date" className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-slate-500">Notice deadline</label>
            <input name="noticeDeadline" type="date" className={inputCls} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="autoRenews" /> Auto-renews
          </label>
          <textarea name="terms" rows={4} placeholder="Paste full contract terms — the AI Chief of Staff answers questions from this text with source references" className={`${inputCls} md:col-span-2`} />
          <button className={btnCls}>Add contract</button>
        </form>
      </Card>
    </div>
  );
}
