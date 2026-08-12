import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, PageHeader, Badge, EmptyState, inputCls, btnCls, btnSecondaryCls, fmtDate } from "@/components/ui";
import { commitMemoryAction, updateMemoryAction, deleteMemoryAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const user = await requireUser();
  const memories = await prisma.memoryItem.findMany({ where: { ownerId: user.id }, orderBy: { updatedAt: "desc" } });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Executive Memory"
        help="memory"
        subtitle="Context you deliberately commit for your AI assistant. You can inspect, edit, and delete everything here. AI guesses never become memory silently."
      />

      <Card title="Commit to memory">
        <form action={commitMemoryAction} className="space-y-3">
          <textarea name="content" rows={2} required placeholder="e.g. Mercy General's survey window opens in October; prioritize EVS readiness." className={inputCls} />
          <div className="flex gap-2">
            <input name="category" placeholder="Category (default GENERAL)" className={inputCls} />
            <button className={btnCls}>Commit to Memory</button>
          </div>
        </form>
      </Card>

      <Card title={`My memory (${memories.length})`}>
        {memories.length === 0 ? (
          <EmptyState>Nothing committed yet.</EmptyState>
        ) : (
          <ul className="space-y-4">
            {memories.map((m) => (
              <li key={m.id} className="rounded-lg border border-slate-200 p-3">
                <div className="mb-1 flex items-center gap-2 text-xs text-slate-400">
                  <Badge tone="INFO">{m.category}</Badge>
                  <span>Source: {m.source ?? "manual"}</span>
                  <span>· committed {fmtDate(m.createdAt)}</span>
                  {m.lastUsedAt && <span>· last used {fmtDate(m.lastUsedAt)}</span>}
                </div>
                <form action={updateMemoryAction} className="flex gap-2">
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="category" value={m.category} />
                  <input name="content" defaultValue={m.content} className={inputCls} />
                  <button className={btnSecondaryCls}>Save</button>
                </form>
                <form action={deleteMemoryAction} className="mt-1">
                  <input type="hidden" name="id" value={m.id} />
                  <button className="text-xs text-red-500 hover:underline">Delete</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
