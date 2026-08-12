import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildBriefing } from "@/lib/services/briefing";
import { Card, Badge, EmptyState, btnSecondaryCls } from "@/components/ui";
import { ackBriefingItemAction, ackContractWatchAction } from "../actions";

export const dynamic = "force-dynamic";

function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function BriefingPage() {
  const user = await requireUser();
  const briefing = await buildBriefing(prisma, user.id);
  const now = new Date();

  const critical = briefing.items.filter((i) => i.urgency === "CRITICAL");
  const attention = briefing.items.filter((i) => i.urgency === "ATTENTION");
  const info = briefing.items.filter((i) => i.urgency === "INFO");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          {greetingFor(now.getHours())}, {briefing.greetingName}.
        </h1>
        <p className="mt-1 text-slate-500">
          Here&apos;s your executive briefing for{" "}
          {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}.
        </p>
        <div className="mt-2">
          <a href="/api/export/briefing" className="text-xs font-medium text-blue-600 hover:underline">
            Export briefing →
          </a>
        </div>
      </div>

      {briefing.contractWatch.length > 0 && (
        <Card title="Contract Renewal Watch">
          <ul className="divide-y divide-slate-100">
            {briefing.contractWatch.map((w) => (
              <li key={`${w.contractId}:${w.kind}`} className="flex items-center gap-4 py-3">
                <div className={`w-24 shrink-0 text-center text-lg font-bold ${w.daysRemaining <= 30 ? "text-red-600" : w.daysRemaining <= 60 ? "text-orange-600" : "text-slate-700"}`}>
                  {w.daysRemaining} DAYS
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={`/contracts/${w.contractId}`} className="font-medium text-slate-900 hover:underline">
                    {w.title}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {w.kind.replaceAll("_", " ")} · {w.date.toDateString()}
                    {w.vendorName && ` · ${w.vendorName}`}
                    {w.openConcerns > 0 && ` · ${w.openConcerns} documented vendor concern(s)`}
                  </div>
                </div>
                <form action={ackContractWatchAction}>
                  <input type="hidden" name="contractId" value={w.contractId} />
                  <input type="hidden" name="kind" value={w.kind} />
                  <button
                    className={btnSecondaryCls}
                    title="Acknowledging this alert removes it from your recurring daily briefing. The deadline remains visible on the contract record and deadline dashboard. Other executives are not affected."
                  >
                    Acknowledge
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-400">
            Acknowledging removes an item from your recurring briefing only. The deadline stays on the contract record
            and the deadline dashboard, and other executives keep their own alerts.
          </p>
        </Card>
      )}

      {[
        { title: "Needs your attention now", items: critical },
        { title: "Worth your attention", items: attention },
        { title: "For your awareness", items: info },
      ].map(({ title, items }) =>
        items.length > 0 ? (
          <Card key={title} title={title}>
            <ul className="divide-y divide-slate-100">
              {items.map((item) => (
                <li key={item.key} className="flex items-start gap-3 py-3">
                  <Badge tone={item.urgency}>{item.kind.replaceAll("_", " ")}</Badge>
                  <div className="min-w-0 flex-1">
                    <Link href={item.href} className="font-medium text-slate-900 hover:underline">
                      {item.title}
                    </Link>
                    {item.detail && <p className="mt-0.5 text-sm text-slate-500">{item.detail}</p>}
                    <Link href={item.href} className="text-xs text-blue-600 hover:underline">
                      View source →
                    </Link>
                  </div>
                  {item.requiresAck && (
                    <form action={ackBriefingItemAction}>
                      <input type="hidden" name="key" value={item.key} />
                      <button
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
                        title="Acknowledging removes this item from your recurring briefing only. The source record remains, and other executives are not affected."
                      >
                        Acknowledge
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ) : null,
      )}

      {briefing.items.length === 0 && briefing.contractWatch.length === 0 && (
        <Card>
          <EmptyState>
            Nothing needs your attention right now. Upload emails, meeting minutes, or start a site visit to build your
            operational picture.
          </EmptyState>
        </Card>
      )}

      <div className="text-center">
        <Link href="/dashboard" className="text-sm font-medium text-blue-600 hover:underline">
          Continue to the Executive Intelligence Workspace →
        </Link>
      </div>
    </div>
  );
}
