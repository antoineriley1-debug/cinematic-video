import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, PageHeader, EmptyState, inputCls, btnCls, fmtDateTime } from "@/components/ui";
import { startConversationAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const user = await requireUser();
  const [memberships, users] = await Promise.all([
    prisma.conversationParticipant.findMany({
      where: { userId: user.id },
      include: {
        conversation: {
          include: {
            participants: { include: { user: true } },
            messages: { orderBy: { createdAt: "desc" }, take: 1 },
          },
        },
      },
    }),
    prisma.user.findMany({ where: { active: true, id: { not: user.id } }, orderBy: { name: "asc" } }),
  ]);

  const conversations = memberships
    .map((m) => m.conversation)
    .sort((a, b) => (b.messages[0]?.createdAt.getTime() ?? 0) - (a.messages[0]?.createdAt.getTime() ?? 0));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Executive Messaging"
        help="messaging" subtitle="Direct and group messages. Share projects, contracts, notes, and files into a conversation." />

      <Card title="Start a conversation">
        <form action={startConversationAction} className="space-y-3">
          <select name="memberIds" multiple size={Math.min(users.length, 5)} className={inputCls}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name} — {u.title}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <input name="title" placeholder="Group title (for multi-person conversations)" className={inputCls} />
            <button className={btnCls}>Start</button>
          </div>
        </form>
      </Card>

      <Card title="Conversations">
        {conversations.length === 0 ? (
          <EmptyState>No conversations yet.</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {conversations.map((c) => {
              const others = c.participants.filter((p) => p.userId !== user.id).map((p) => p.user.name);
              const last = c.messages[0];
              const me = c.participants.find((p) => p.userId === user.id);
              const unread = last && last.senderId !== user.id && (!me?.lastReadAt || last.createdAt > me.lastReadAt);
              return (
                <li key={c.id}>
                  <Link href={`/messages/${c.id}`} className="flex items-center gap-3 py-3 hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm ${unread ? "font-bold text-slate-900" : "font-medium text-slate-800"}`}>
                        {c.title ?? others.join(", ") ?? "Conversation"}
                      </div>
                      {last && <div className="truncate text-xs text-slate-500">{last.content}</div>}
                    </div>
                    {last && <span className="text-xs text-slate-400">{fmtDateTime(last.createdAt)}</span>}
                    {unread && <span className="h-2 w-2 rounded-full bg-blue-600" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
