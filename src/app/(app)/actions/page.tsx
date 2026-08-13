import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hrefFor } from "@/lib/services/briefing";
import { Card, PageHeader, Badge, EmptyState, inputCls, btnCls, fmtDate, SourceLink } from "@/components/ui";
import { createActionItemAction, completeActionItemAction, updateActionItemAction, deleteActionItemAction } from "../actions";
import { ConfirmButton } from "@/components/ConfirmButton";

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
        {open.length > 0 && (
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
            {open.map((a) => (
              <details key={a.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <summary className="cursor-pointer text-xs font-medium text-slate-700">Edit: {a.title}</summary>
                <EditActionForm item={a} sites={sites} />
              </details>
            ))}
          </div>
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
              <li key={a.id} className="flex items-center gap-3">
                <span className="line-through">{a.title}</span>
                <span className="text-xs">{fmtDate(a.completedAt)}</span>
                <form action={updateActionItemAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="title" value={a.title} />
                  <input type="hidden" name="kind" value={a.kind} />
                  <input type="hidden" name="details" value={a.details ?? ""} />
                  <input type="hidden" name="siteId" value={a.siteId ?? ""} />
                  <input type="hidden" name="dueDate" value={a.dueDate ? a.dueDate.toISOString().slice(0, 10) : ""} />
                  <input type="hidden" name="status" value="OPEN" />
                  <button className="text-xs font-medium text-blue-600 hover:underline">Reopen</button>
                </form>
                <form action={deleteActionItemAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <ConfirmButton message={`Delete "${a.title}"? This cannot be undone.`} className="text-xs font-medium text-red-600 hover:underline">
                    Delete
                  </ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

type ActionRow = {
  id: string; title: string; details: string | null; kind: string;
  siteId: string | null; dueDate: Date | null; status: string;
};

function EditActionForm({ item, sites }: { item: ActionRow; sites: { id: string; name: string }[] }) {
  return (
    <form action={updateActionItemAction} className="mt-3 grid gap-2 md:grid-cols-4">
      <input type="hidden" name="id" value={item.id} />
      <input name="title" defaultValue={item.title} required className={`${inputCls} md:col-span-2`} />
      <select name="kind" defaultValue={item.kind} className={inputCls}>
        <option value="ACTION">Action</option>
        <option value="DEADLINE">Deadline</option>
      </select>
      <div>
        <label className="text-xs text-slate-500">Due (blank clears)</label>
        <input name="dueDate" type="date" defaultValue={item.dueDate ? item.dueDate.toISOString().slice(0, 10) : ""} className={inputCls} />
      </div>
      <input name="details" defaultValue={item.details ?? ""} placeholder="Details" className={`${inputCls} md:col-span-2`} />
      <select name="siteId" defaultValue={item.siteId ?? ""} className={inputCls}>
        <option value="">No site</option>
        {sites.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <select name="status" defaultValue={item.status} className={inputCls}>
        <option value="OPEN">Open</option>
        <option value="DONE">Done</option>
        <option value="CANCELLED">Cancelled</option>
      </select>
      <button className={`${btnCls} md:col-span-3`}>Save changes</button>
      <ConfirmButton message={`Delete "${item.title}"? This cannot be undone.`} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50" formAction={deleteActionItemAction}>
        Delete
      </ConfirmButton>
    </form>
  );
}
