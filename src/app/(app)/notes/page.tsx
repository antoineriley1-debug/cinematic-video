import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { EntityTypes, FlagLabels } from "@/lib/validate";
import { Card, PageHeader, Badge, EmptyState, inputCls, btnCls, fmtDate } from "@/components/ui";
import { createNoteAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const user = await requireUser();
  const { scope } = await searchParams;
  const corporate = scope === "corporate";
  const notes = await prisma.note.findMany({
    where: {
      ...(corporate ? { scope: "CORPORATE" } : {}),
      OR: [{ authorId: user.id }, { visibility: "PUBLIC" }],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const authors = await prisma.user.findMany({ where: { id: { in: notes.map((n) => n.authorId) } } });
  const flags = await prisma.flag.findMany({ where: { userId: user.id, entityType: "NOTE" } });
  const authorName = (id: string) => authors.find((u) => u.id === id)?.name ?? "Unknown";

  return (
    <div className="space-y-6">
      <PageHeader
        title={corporate ? "Corporate Notes" : "Executive Notes"}
        subtitle="Notes default to private. Public notes are visible to authorized executives and support comments, replies, and @mentions."
        action={
          <div className="flex gap-2 text-sm">
            <Link href="/notes" className={!corporate ? "font-bold text-blue-700" : "text-slate-500"}>Executive</Link>
            <span className="text-slate-300">|</span>
            <Link href="/notes?scope=corporate" className={corporate ? "font-bold text-blue-700" : "text-slate-500"}>Corporate workspace</Link>
          </div>
        }
      />

      <Card title="New note">
        <form action={createNoteAction} className="space-y-3">
          <input name="title" placeholder="Title (optional)" className={inputCls} />
          <textarea name="content" rows={3} required placeholder="Write your note — @Name directs attention when public" className={inputCls} />
          <div className="grid gap-3 md:grid-cols-3">
            <select name="visibility" className={inputCls}>
              <option value="PRIVATE">Private — only me</option>
              <option value="PUBLIC">Public — visible to executives</option>
            </select>
            <select name="scope" defaultValue={corporate ? "CORPORATE" : "EXECUTIVE"} className={inputCls}>
              <option value="EXECUTIVE">Executive note</option>
              <option value="CORPORATE">Corporate note</option>
            </select>
            <button className={btnCls}>Create note</button>
          </div>
        </form>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {notes.map((n) => {
          const myFlags = flags.filter((f) => f.entityId === n.id);
          return (
            <Link key={n.id} href={`/notes/${n.id}`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300">
              <div className="flex items-center gap-2">
                <Badge tone={n.visibility === "PUBLIC" ? "INFO" : "NORMAL"}>{n.visibility}</Badge>
                {n.scope === "CORPORATE" && <Badge tone="ATTENTION">CORPORATE</Badge>}
                {myFlags.map((f) => (
                  <Badge key={f.id} tone="HIGH">🚩 {f.label.replaceAll("_", " ")}</Badge>
                ))}
              </div>
              <div className="mt-1 font-semibold text-slate-900">{n.title ?? "(untitled)"}</div>
              <p className="mt-1 line-clamp-2 text-sm text-slate-600">{n.content}</p>
              <div className="mt-2 text-xs text-slate-400">{authorName(n.authorId)} · {fmtDate(n.createdAt)}</div>
            </Link>
          );
        })}
        {notes.length === 0 && <Card><EmptyState>No notes yet.</EmptyState></Card>}
      </div>
    </div>
  );
}
