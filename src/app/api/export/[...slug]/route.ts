// Report/export endpoints. Every export requires an authenticated session
// and reuses permission-aware service code; downloads are plain text with
// source attribution preserved.
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { siteReport, directorReport, vendorReport, meetingReport, activityReport } from "@/lib/services/exports";
import { buildTimeline, exportTimelineText } from "@/lib/services/emails";
import { buildBriefing, exportBriefingText } from "@/lib/services/briefing";

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string[] }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await ctx.params;
  const [kind, id] = slug;

  try {
    let text: string;
    let filename: string;
    switch (kind) {
      case "site":
        text = await siteReport(prisma, id, user.id);
        filename = `site-report-${id}.txt`;
        break;
      case "director":
        text = await directorReport(prisma, id, user.id);
        filename = `director-history-${id}.txt`;
        break;
      case "vendor":
        text = await vendorReport(prisma, id);
        filename = `vendor-report-${id}.txt`;
        break;
      case "meeting":
        text = await meetingReport(prisma, id);
        filename = `meeting-report-${id}.txt`;
        break;
      case "email-timeline": {
        const batch = await prisma.emailBatch.findUniqueOrThrow({ where: { id } });
        const timeline = await buildTimeline(prisma, { batchId: id });
        text = exportTimelineText(timeline, batch.title ?? "Email timeline");
        filename = `email-chronology-${id}.txt`;
        break;
      }
      case "briefing": {
        const briefing = await buildBriefing(prisma, user.id);
        text = exportBriefingText(briefing);
        filename = `briefing-${briefing.date}.txt`;
        break;
      }
      case "activity": {
        const days = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("days") ?? "14", 10) || 14, 1), 365);
        const from = new Date(Date.now() - days * 24 * 3600 * 1000);
        text = await activityReport(prisma, user.id, from, new Date());
        filename = `activity-report.txt`;
        break;
      }
      default:
        return NextResponse.json({ error: "Unknown export" }, { status: 404 });
    }

    await audit(prisma, { actorId: user.id, action: "EXPORT_GENERATED", entityType: "BRIEFING", entityId: `${kind}:${id ?? "self"}`, source: "API" });
    return new NextResponse(text, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Export failed or record not found" }, { status: 404 });
  }
}
