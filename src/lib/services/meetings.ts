// Meeting minutes: upload, AI (or deterministic) analysis, extracted actions
// become real action items, and everything feeds the next-day briefing rule.
import type { Db } from "../db";
import { audit } from "../audit";
import { recordActivity } from "../activity";
import type { Orchestrator } from "../ai/orchestrator";
import { analyzeMeeting } from "../ai/capabilities";

export async function uploadMeeting(
  db: Db,
  orchestrator: Orchestrator,
  opts: { title: string; heldAt?: Date; minutesText: string; uploadedById: string },
) {
  const meeting = await db.meeting.create({
    data: {
      title: opts.title,
      heldAt: opts.heldAt ?? null,
      minutesText: opts.minutesText,
      uploadedById: opts.uploadedById,
    },
  });
  const analysis = await analyzeMeeting(db, orchestrator, opts.minutesText, {
    userId: opts.uploadedById,
    meetingId: meeting.id,
  });
  await db.meeting.update({
    where: { id: meeting.id },
    data: {
      summary: analysis.summary,
      decisionsJson: JSON.stringify(analysis.decisions),
      actionsJson: JSON.stringify(analysis.actions),
      unresolvedJson: JSON.stringify(analysis.unresolved),
      analysisMode: analysis.mode,
    },
  });
  // Extracted actions become first-class action items connected to the meeting.
  for (const action of analysis.actions.slice(0, 20)) {
    const due = action.due ? new Date(action.due) : null;
    await db.actionItem.create({
      data: {
        kind: "ACTION",
        title: action.title.slice(0, 300),
        details: action.owner ? `Owner (from minutes): ${action.owner}` : null,
        dueDate: due && !isNaN(due.getTime()) ? due : null,
        sourceType: "MEETING",
        sourceId: meeting.id,
        createdById: opts.uploadedById,
      },
    });
  }
  await audit(db, { actorId: opts.uploadedById, action: "MEETING_UPLOADED", entityType: "MEETING", entityId: meeting.id, after: { title: opts.title, mode: analysis.mode } });
  await recordActivity(db, {
    userId: opts.uploadedById,
    type: "MEETING_UPLOADED",
    summary: `Meeting minutes uploaded: ${opts.title}`,
    entityType: "MEETING",
    entityId: meeting.id,
    occurredAt: opts.heldAt ?? undefined,
  });
  return { meetingId: meeting.id, mode: analysis.mode };
}

/** Meetings uploaded since the previous briefing that have not been briefed. */
export async function unbriefedMeetings(db: Db) {
  return db.meeting.findMany({ where: { briefedAt: null }, orderBy: { createdAt: "desc" } });
}
