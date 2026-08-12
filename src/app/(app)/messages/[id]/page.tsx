import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { markRead } from "@/lib/services/messaging";
import { hrefFor } from "@/lib/services/briefing";
import { Card, PageHeader, EmptyState, inputCls, btnCls, fmtDateTime } from "@/components/ui";
import { sendMessageAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      participants: { include: { user: true } },
      messages: { orderBy: { createdAt: "asc" }, include: { sender: true } },
      briefs: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!conversation) notFound();
  // Authorization: only participants may read a conversation.
  if (!conversation.participants.some((p) => p.userId === user.id)) redirect("/messages");
  await markRead(prisma, id, user.id);

  const others = conversation.participants.filter((p) => p.userId !== user.id).map((p) => p.user.name);
  const shareables = {
    projects: await prisma.project.findMany({ take: 20, orderBy: { createdAt: "desc" } }),
    contracts: await prisma.contract.findMany({ take: 20, orderBy: { createdAt: "desc" } }),
    notes: await prisma.note.findMany({ where: { OR: [{ authorId: user.id }, { visibility: "PUBLIC" }] }, take: 20, orderBy: { createdAt: "desc" } }),
  };
  const brief = conversation.briefs[0];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={conversation.title ?? others.join(", ")}
        subtitle={`Participants: ${conversation.participants.map((p) => p.user.name).join(", ")}`}
      />

      {brief && (
        <Card title="Conversation Brief (AI)">
          <pre className="whitespace-pre-wrap text-xs text-slate-600">{JSON.stringify(JSON.parse(brief.content), null, 2)}</pre>
        </Card>
      )}

      <Card>
        {conversation.messages.length === 0 ? (
          <EmptyState>No messages yet.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {conversation.messages.map((m) => (
              <li key={m.id} className={`flex ${m.senderId === user.id ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${m.senderId === user.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-800"}`}>
                  <div className={`text-xs ${m.senderId === user.id ? "text-blue-200" : "text-slate-400"}`}>
                    {m.sender.name} · {fmtDateTime(m.createdAt)}
                  </div>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.sharedEntityType && m.sharedEntityId && (
                    <Link
                      href={hrefFor(m.sharedEntityType, m.sharedEntityId)}
                      className={`mt-1 block rounded-lg px-2 py-1 text-xs font-medium ${m.senderId === user.id ? "bg-blue-700 text-white" : "bg-white text-blue-700"}`}
                    >
                      📎 Shared {m.sharedEntityType.toLowerCase()} — open →
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <form action={sendMessageAction} className="mt-4 space-y-2">
          <input type="hidden" name="conversationId" value={conversation.id} />
          <div className="flex gap-2">
            <input name="content" placeholder="Message — @Name to mention" required className={inputCls} autoComplete="off" />
            <button className={btnCls}>Send</button>
          </div>
          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer">Share an object into this conversation</summary>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <select name="sharedEntityType" className={inputCls}>
                <option value="">Nothing</option>
                <option value="PROJECT">Project</option>
                <option value="CONTRACT">Contract</option>
                <option value="NOTE">Note</option>
              </select>
              <select name="sharedEntityId" className={inputCls}>
                <option value="">Select…</option>
                {shareables.projects.map((p) => <option key={p.id} value={p.id}>Project: {p.name}</option>)}
                {shareables.contracts.map((c) => <option key={c.id} value={c.id}>Contract: {c.title}</option>)}
                {shareables.notes.map((n) => <option key={n.id} value={n.id}>Note: {n.title ?? "(untitled)"}</option>)}
              </select>
            </div>
          </details>
        </form>
      </Card>
    </div>
  );
}
