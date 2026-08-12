import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, PageHeader, EmptyState, ModeBadge, inputCls, btnCls, fmtDate } from "@/components/ui";
import { uploadMeetingAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function MeetingsPage() {
  await requireUser();
  const meetings = await prisma.meeting.findMany({ orderBy: { createdAt: "desc" }, take: 30 });

  return (
    <div className="space-y-6">
      <PageHeader title="Meeting Minutes" subtitle="Uploads since your previous briefing feed the next daily briefing automatically." />

      <Card title="Upload minutes">
        <form action={uploadMeetingAction} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <input name="title" placeholder="Meeting title" required className={inputCls} />
            <div>
              <label className="text-xs text-slate-500">Held on</label>
              <input name="heldAt" type="date" className={inputCls} />
            </div>
          </div>
          <input name="file" type="file" accept=".txt,.md,text/plain" className={inputCls} />
          <textarea name="minutesText" rows={6} placeholder="…or paste the minutes here" className={inputCls} />
          <button className={btnCls}>Upload &amp; analyze</button>
        </form>
      </Card>

      <Card title="Meetings">
        {meetings.length === 0 ? (
          <EmptyState>No meetings uploaded.</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {meetings.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <Link href={`/meetings/${m.id}`} className="font-medium text-slate-900 hover:underline">{m.title}</Link>
                  <div className="text-xs text-slate-500">{fmtDate(m.heldAt ?? m.createdAt)}{m.briefedAt ? " · appeared in briefing" : " · pending next briefing"}</div>
                </div>
                <ModeBadge mode={m.analysisMode} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
