import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { linksFor } from "@/lib/links";
import { hrefFor } from "@/lib/services/briefing";
import { FlagLabels, EntityTypes } from "@/lib/validate";
import { Card, PageHeader, Badge, EmptyState, inputCls, btnCls, btnSecondaryCls, fmtDate } from "@/components/ui";
import { addCommentAction, toggleFlagAction, makeNotePublicAction, directAttentionAction, addLinkAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const note = await prisma.note.findUnique({ where: { id } });
  if (!note) notFound();
  // Authorization: private notes are visible only to their author.
  if (note.visibility === "PRIVATE" && note.authorId !== user.id) redirect("/notes");

  const [author, comments, myFlags, links, users, sites, vendors, directors, contracts, projects] = await Promise.all([
    prisma.user.findUnique({ where: { id: note.authorId } }),
    prisma.comment.findMany({ where: { entityType: "NOTE", entityId: id }, orderBy: { createdAt: "asc" } }),
    prisma.flag.findMany({ where: { userId: user.id, entityType: "NOTE", entityId: id } }),
    linksFor(prisma, { type: "NOTE", id }, { confirmedOnly: true }),
    prisma.user.findMany({ where: { active: true, id: { not: user.id } } }),
    prisma.site.findMany({ orderBy: { name: "asc" } }),
    prisma.vendor.findMany({ orderBy: { name: "asc" } }),
    prisma.director.findMany({ orderBy: { name: "asc" } }),
    prisma.contract.findMany({ orderBy: { title: "asc" } }),
    prisma.project.findMany({ orderBy: { name: "asc" } }),
  ]);
  const commentAuthors = await prisma.user.findMany({ where: { id: { in: comments.map((c) => c.authorId) } } });
  const authorName = (aid: string) => commentAuthors.find((u) => u.id === aid)?.name ?? "Unknown";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={note.title ?? "(untitled note)"}
        subtitle={`${author?.name ?? "Unknown"} · ${fmtDate(note.createdAt)} · ${note.scope === "CORPORATE" ? "Corporate workspace" : "Executive note"}`}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={note.visibility === "PUBLIC" ? "INFO" : "NORMAL"}>{note.visibility}</Badge>
            {note.visibility === "PRIVATE" && note.authorId === user.id && (
              <form action={makeNotePublicAction}>
                <input type="hidden" name="noteId" value={note.id} />
                <button className={btnSecondaryCls} title="Public notes become visible to authorized executives and support comments, replies, attachments, and @mentions.">
                  Make public
                </button>
              </form>
            )}
          </div>
        }
      />

      <Card>
        <p className="whitespace-pre-wrap text-sm text-slate-800">{note.content}</p>
      </Card>

      <Card title="My private flags (visible only to me)">
        <div className="flex flex-wrap gap-2">
          {FlagLabels.map((label) => {
            const active = myFlags.some((f) => f.label === label);
            return (
              <form key={label} action={toggleFlagAction}>
                <input type="hidden" name="entityType" value="NOTE" />
                <input type="hidden" name="entityId" value={note.id} />
                <input type="hidden" name="label" value={label} />
                <input type="hidden" name="path" value={`/notes/${note.id}`} />
                <button className={`rounded-full border px-3 py-1 text-xs font-medium ${active ? "border-amber-400 bg-amber-100 text-amber-800" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}>
                  {active ? "🚩 " : ""}{label.replaceAll("_", " ")}
                </button>
              </form>
            );
          })}
        </div>
      </Card>

      <Card title="Connections">
        <ul className="space-y-1 text-sm">
          {links.map((l) => (
            <li key={l.link.id}>
              <Link href={hrefFor(l.other.type, l.other.id)} className="text-blue-700 hover:underline">
                {l.other.type.toLowerCase()} record →
              </Link>
            </li>
          ))}
          {links.length === 0 && <EmptyState>Not connected to anything yet.</EmptyState>}
        </ul>
        <form action={addLinkAction} className="mt-3 grid gap-2 md:grid-cols-3">
          <input type="hidden" name="fromType" value="NOTE" />
          <input type="hidden" name="fromId" value={note.id} />
          <input type="hidden" name="path" value={`/notes/${note.id}`} />
          <select name="toType" className={inputCls} required>
            <option value="SITE">Site</option>
            <option value="DIRECTOR">Director</option>
            <option value="VENDOR">Vendor</option>
            <option value="CONTRACT">Contract</option>
            <option value="PROJECT">Project</option>
          </select>
          <select name="toId" className={inputCls} required>
            {sites.map((s) => <option key={s.id} value={s.id}>Site: {s.name}</option>)}
            {directors.map((d) => <option key={d.id} value={d.id}>Director: {d.name}</option>)}
            {vendors.map((v) => <option key={v.id} value={v.id}>Vendor: {v.name}</option>)}
            {contracts.map((c) => <option key={c.id} value={c.id}>Contract: {c.title}</option>)}
            {projects.map((p) => <option key={p.id} value={p.id}>Project: {p.name}</option>)}
          </select>
          <button className={btnSecondaryCls}>Connect</button>
        </form>
        <p className="mt-2 text-xs text-slate-400">Pick the record matching the type you selected — mismatched picks are ignored.</p>
      </Card>

      {note.visibility === "PUBLIC" && (
        <>
          <Card title="Direct another executive's attention">
            <form action={directAttentionAction} className="grid gap-2 md:grid-cols-3">
              <input type="hidden" name="entityType" value="NOTE" />
              <input type="hidden" name="entityId" value={note.id} />
              <input type="hidden" name="path" value={`/notes/${note.id}`} />
              <select name="targetUserId" required className={inputCls}>
                <option value="">Choose executive…</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <input name="message" placeholder="Optional message" className={inputCls} />
              <button className={btnCls}>Notify</button>
            </form>
          </Card>

          <Card title="Discussion (threaded, @mentions supported)">
            <ul className="space-y-3">
              {comments.filter((c) => !c.parentId).map((c) => (
                <li key={c.id} className="text-sm">
                  <span className="font-medium text-slate-900">{authorName(c.authorId)}</span>
                  <span className="ml-2 text-xs text-slate-400">{fmtDate(c.createdAt)}</span>
                  <p className="text-slate-700">{c.content}</p>
                  <ul className="ml-6 mt-2 space-y-2 border-l-2 border-slate-100 pl-3">
                    {comments.filter((r) => r.parentId === c.id).map((r) => (
                      <li key={r.id}>
                        <span className="font-medium text-slate-900">{authorName(r.authorId)}</span>
                        <span className="ml-2 text-xs text-slate-400">{fmtDate(r.createdAt)}</span>
                        <p className="text-slate-700">{r.content}</p>
                      </li>
                    ))}
                  </ul>
                  <form action={addCommentAction} className="ml-6 mt-2 flex gap-2">
                    <input type="hidden" name="entityType" value="NOTE" />
                    <input type="hidden" name="entityId" value={note.id} />
                    <input type="hidden" name="parentId" value={c.id} />
                    <input type="hidden" name="path" value={`/notes/${note.id}`} />
                    <input name="content" placeholder="Reply…" required className={inputCls} />
                    <button className={btnSecondaryCls}>Reply</button>
                  </form>
                </li>
              ))}
            </ul>
            <form action={addCommentAction} className="mt-4 flex gap-2">
              <input type="hidden" name="entityType" value="NOTE" />
              <input type="hidden" name="entityId" value={note.id} />
              <input type="hidden" name="path" value={`/notes/${note.id}`} />
              <input name="content" placeholder="Comment — @Name directs attention" required className={inputCls} />
              <button className={btnCls}>Post</button>
            </form>
          </Card>
        </>
      )}
    </div>
  );
}
