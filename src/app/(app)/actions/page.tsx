import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hrefFor } from "@/lib/services/briefing";
import { Card, PageHeader, Badge, EmptyState, inputCls, btnCls, fmtDate, SourceLink } from "@/components/ui";
import { createActionItemAction, completeActionItemAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ActionsPage() {
  const user = await requireUser();
  const now = new Date();
  const [open, done, sites] = await Promise.all([
    prisma.actionItem.findMany({ where: { status: "OPEN" }, orderBy: [{ dueDate: "asc" }] }),
    prisma.actionItem.findMany({ where: { status: "DONE" }, orderBy: { completedAt: "desc" }, take: 15 }),
    prisma.site.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Actions & Deadlines" subtitle={`${open.length} open · deadline dashboard`} />

      <Card title="Open">
        {open.length === 0 ? (
          <EmptyState>Nothing open.</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {open.map((a) => {
              const overdue = a.dueDate && a.dueDate < now;
              return (
                <li key={a.id} className="flex items-center gap-3 py-2 text-sm">
                  <Badge tone={overdue ? "CRITICAL" : a.kind === "DEADLINE" ? "ATTENTION" : "OPEN"}>{a.kind}</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-800">{a.title}</div>
                    {a.details && <div className="text-xs text-slate-500">{a.details}</div>}
                    {a.sourceType && a.sourceId && (
                      <SourceLink href={hrefFor(a.sourceType, a.sourceId)}>from {a.sourceType.toLowerCase()} →</SourceLink>
                    )}
                  </div>
                  {a.dueDate && (
                    <span className={`text-xs ${overdue ? "font-bold text-red-600" : "text-slate-400"}`}>
                      {overdue ? "OVERDUE · " : ""}{fmtDate(a.dueDate)}
                    </span>
                  )}
                  <form action={completeActionItemAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <button className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-emerald-50">
                      Complete
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="New action or deadline">
        <form action={createActionItemAction} className="grid gap-3 md:grid-cols-4">
          <input name="title" placeholder="Title" required className={`${inputCls} md:col-span-2`} />
          <select name="kind" className={inputCls}>
            <option value="ACTION">Action</option>
            <option value="DEADLINE">Deadline</option>
          </select>
          <div>
            <input name="dueDate" type="date" className={inputCls} />
          </div>
          <input name="details" placeholder="Details" className={`${inputCls} md:col-span-2`} />
          <select name="siteId" className={inputCls}>
            <option value="">No site</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button className={btnCls}>Add</button>
        </form>
      </Card>

      <Card title="Recently completed">
        {done.length === 0 ? (
          <EmptyState>Nothing completed yet.</EmptyState>
        ) : (
          <ul className="space-y-1 text-sm text-slate-500">
            {done.map((a) => (
              <li key={a.id}>
                <span className="line-through">{a.title}</span>
                <span className="ml-2 text-xs">{fmtDate(a.completedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
