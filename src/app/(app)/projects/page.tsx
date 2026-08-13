import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, PageHeader, Badge, EmptyState, inputCls, btnCls, fmtDate } from "@/components/ui";
import { createProjectAction, addCommentAction, deleteProjectAction, updateProjectAction } from "../actions";
import { ConfirmButton } from "@/components/ConfirmButton";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  await requireUser();
  const [projects, sites] = await Promise.all([
    prisma.project.findMany({ include: { site: true }, orderBy: [{ status: "asc" }, { createdAt: "desc" }] }),
    prisma.site.findMany({ orderBy: { name: "asc" } }),
  ]);
  const comments = await prisma.comment.findMany({ where: { entityType: "PROJECT", entityId: { in: projects.map((p) => p.id) } }, orderBy: { createdAt: "asc" } });
  const authors = await prisma.user.findMany({ where: { id: { in: comments.map((c) => c.authorId) } } });
  const authorName = (id: string) => authors.find((u) => u.id === id)?.name ?? "Unknown";

  return (
    <div className="space-y-6">
      <PageHeader title="Projects" subtitle={`${projects.filter((p) => p.status === "ACTIVE").length} active · ${projects.filter((p) => p.status === "BACKBURNER").length} on the back burner`} />

      <div className="grid gap-4 lg:grid-cols-2">
        {projects.map((p) => (
          <Card key={p.id}>
            <div className="flex items-center gap-2">
              <Badge tone={p.status}>{p.status.replaceAll("_", " ")}</Badge>
              <Badge tone={p.priority}>{p.priority}</Badge>
              <span className="font-semibold text-slate-900">{p.name}</span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {p.site?.name ?? "Corporate"} {p.dueDate ? `· due ${fmtDate(p.dueDate)}` : ""}
            </div>
            {p.description && <p className="mt-2 text-sm text-slate-600">{p.description}</p>}
            <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer text-xs font-medium text-slate-700">Edit project</summary>
              <form action={updateProjectAction} className="mt-3 grid gap-2 md:grid-cols-2">
                <input type="hidden" name="id" value={p.id} />
                <input name="name" defaultValue={p.name} required className={`${inputCls} md:col-span-2`} />
                <textarea name="description" rows={2} defaultValue={p.description ?? ""} placeholder="Description" className={`${inputCls} md:col-span-2`} />
                <select name="siteId" defaultValue={p.siteId ?? ""} className={inputCls}>
                  <option value="">Corporate / no site</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <select name="status" defaultValue={p.status} className={inputCls}>
                  <option value="ACTIVE">Active</option>
                  <option value="ON_HOLD">On hold</option>
                  <option value="BACKBURNER">Back burner / radar</option>
                  <option value="COMPLETED">Completed</option>
                </select>
                <select name="priority" defaultValue={p.priority} className={inputCls}>
                  <option value="LOW">Low priority</option>
                  <option value="MEDIUM">Medium priority</option>
                  <option value="HIGH">High priority</option>
                </select>
                <div>
                  <label className="text-xs text-slate-500">Due date (blank clears)</label>
                  <input name="dueDate" type="date" defaultValue={p.dueDate ? p.dueDate.toISOString().slice(0, 10) : ""} className={inputCls} />
                </div>
                <button className={`${btnCls} md:col-span-2`}>Save changes</button>
              </form>
            </details>
            <div className="mt-2 flex items-center gap-3">
              <a href={`/api/export/project/${p.id}`} className="text-xs font-medium text-blue-600 hover:underline">Export report →</a>
              <form action={deleteProjectAction}>
                <input type="hidden" name="id" value={p.id} />
                <ConfirmButton
                  message={`Delete project "${p.name}"? Its comments and links go with it. This cannot be undone.`}
                  className="text-xs font-medium text-red-600 hover:underline"
                >
                  Delete
                </ConfirmButton>
              </form>
            </div>
            <div className="mt-3 border-t border-slate-100 pt-3">
              <div className="space-y-2">
                {comments.filter((c) => c.entityId === p.id).map((c) => (
                  <p key={c.id} className="text-xs text-slate-600">
                    <span className="font-medium text-slate-800">{authorName(c.authorId)}:</span> {c.content}
                  </p>
                ))}
              </div>
              <form action={addCommentAction} className="mt-2 flex gap-2">
                <input type="hidden" name="entityType" value="PROJECT" />
                <input type="hidden" name="entityId" value={p.id} />
                <input type="hidden" name="path" value="/projects" />
                <input name="content" placeholder="Discuss this project…" required className={inputCls} />
                <button className="rounded-lg border border-slate-300 px-2 text-xs text-slate-600 hover:bg-slate-50">Post</button>
              </form>
            </div>
          </Card>
        ))}
        {projects.length === 0 && <Card><EmptyState>No projects yet.</EmptyState></Card>}
      </div>

      <Card title="New project">
        <form action={createProjectAction} className="grid gap-3 md:grid-cols-3">
          <input name="name" placeholder="Project name" required className={inputCls} />
          <select name="siteId" className={inputCls}>
            <option value="">Corporate / no site</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select name="priority" className={inputCls}>
            <option value="LOW">Low priority</option>
            <option value="MEDIUM">Medium priority</option>
            <option value="HIGH">High priority</option>
          </select>
          <select name="status" className={inputCls}>
            <option value="ACTIVE">Active</option>
            <option value="ON_HOLD">On hold</option>
            <option value="BACKBURNER">Back burner / radar</option>
          </select>
          <div>
            <label className="text-xs text-slate-500">Due date</label>
            <input name="dueDate" type="date" className={inputCls} />
          </div>
          <textarea name="description" rows={1} placeholder="Description" className={inputCls} />
          <button className={btnCls}>Create project</button>
        </form>
      </Card>
    </div>
  );
}
