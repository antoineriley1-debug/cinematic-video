import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ObservationCategories } from "@/lib/validate";
import { Card, PageHeader, Badge, inputCls, btnCls, btnSecondaryCls, fmtDateTime } from "@/components/ui";
import { addVisitObservationAction, completeVisitAction } from "../../actions";

export const dynamic = "force-dynamic";

const CATEGORY_HELP: Record<string, string> = {
  POSITIVE: "What is working well",
  IMPROVEMENT: "Items needing improvement",
  TRAINING: "Training / coaching / competency requirements",
  CRITICAL: "Issues requiring elevated or immediate attention",
  PROJECT: "Existing or newly identified projects",
  BACKBURNER: "Worth monitoring without immediate action",
};

export default async function VisitPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const visit = await prisma.siteVisit.findUnique({
    where: { id },
    include: { site: true, observations: { orderBy: { createdAt: "desc" } } },
  });
  if (!visit) notFound();
  const inProgress = visit.status === "IN_PROGRESS";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={`Site Visit — ${visit.site.name}`}
        subtitle={`Started ${fmtDateTime(visit.startedAt)}${visit.completedAt ? ` · Completed ${fmtDateTime(visit.completedAt)}` : " · In progress"}`}
      />

      {ObservationCategories.map((category) => {
        const obs = visit.observations.filter((o) => o.category === category);
        return (
          <Card key={category} title={`${category.replaceAll("_", " ")} — ${CATEGORY_HELP[category]}`}>
            <ul className="space-y-1.5">
              {obs.map((o) => (
                <li key={o.id} className="text-sm text-slate-700">• {o.content}</li>
              ))}
            </ul>
            {inProgress && (
              <form action={addVisitObservationAction} className="mt-3 flex gap-2">
                <input type="hidden" name="visitId" value={visit.id} />
                <input type="hidden" name="category" value={category} />
                <input name="content" placeholder="Record an observation…" required className={inputCls} />
                <button className={btnSecondaryCls}>Add</button>
              </form>
            )}
          </Card>
        );
      })}

      {inProgress ? (
        <Card title="Complete this visit">
          <form action={completeVisitAction} className="space-y-3">
            <input type="hidden" name="visitId" value={visit.id} />
            <textarea name="summary" rows={3} placeholder="Visit summary (optional)" className={inputCls} />
            <button className={btnCls}>Complete visit — creates the structured visit record and calendar activity</button>
          </form>
        </Card>
      ) : (
        <Card>
          <Badge tone="COMPLETED">Visit completed</Badge>
          {visit.summary && <p className="mt-2 text-sm text-slate-700">{visit.summary}</p>}
        </Card>
      )}
    </div>
  );
}
