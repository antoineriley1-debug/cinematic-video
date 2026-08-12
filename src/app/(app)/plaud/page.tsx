import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, PageHeader, Badge, EmptyState, ModeBadge, inputCls, btnCls, fmtDate } from "@/components/ui";
import { importPlaudAction, uploadPlaudAudioAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function PlaudPage() {
  await requireUser();
  const recordings = await prisma.plaudRecording.findMany({ orderBy: { createdAt: "desc" }, take: 30 });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plaud Recordings"
        help="plaud"
        subtitle="Plaud is the designated recording source. Drag audio files straight in, or import transcripts — direct API sync can be added later."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Upload audio recordings (drag & drop)">
          <form action={uploadPlaudAudioAction} className="space-y-3">
            <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500 hover:border-blue-400 hover:bg-blue-50">
              <span className="font-medium text-slate-700">Drop audio files here or tap to choose</span>
              <span className="mt-1 text-xs">MP3, M4A, WAV… — up to 10 files at once</span>
              <input name="audioFiles" type="file" multiple accept="audio/*,.m4a,.mp3,.wav,.aac,.ogg,.opus" className="sr-only" />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <input name="title" placeholder="Title (defaults to the file name)" className={inputCls} />
              <div>
                <label className="text-xs text-slate-500">Recorded on</label>
                <input name="recordedAt" type="date" className={inputCls} />
              </div>
            </div>
            <button className={btnCls}>Upload audio</button>
            <p className="text-xs text-slate-400">
              Audio is stored securely and playable in-app. Attach the transcript exported from the Plaud app on the
              recording&apos;s page to unlock AI analysis — decisions, actions, and connections.
            </p>
          </form>
        </Card>

        <Card title="Import a transcript">
          <form action={importPlaudAction} className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <input name="title" placeholder="Recording title" required className={inputCls} />
              <div>
                <label className="text-xs text-slate-500">Recorded on</label>
                <input name="recordedAt" type="date" className={inputCls} />
              </div>
            </div>
            <input name="file" type="file" accept=".txt,text/plain" className={inputCls} />
            <textarea name="transcript" rows={4} placeholder="…or paste the transcript" className={inputCls} />
            <button className={btnCls}>Import &amp; analyze</button>
            <p className="text-xs text-slate-400">
              Sensitive classifications (e.g. discipline) always require human confirmation — AI analysis of a recording
              never becomes a formal employee record by itself.
            </p>
          </form>
        </Card>
      </div>

      <Card title="Recordings">
        {recordings.length === 0 ? <EmptyState>No recordings yet.</EmptyState> : (
          <ul className="divide-y divide-slate-100">
            {recordings.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <Link href={`/plaud/${r.id}`} className="font-medium text-slate-900 hover:underline">{r.title}</Link>
                  <div className="text-xs text-slate-500">{fmtDate(r.recordedAt ?? r.createdAt)}</div>
                </div>
                {r.fileId && <Badge tone="INFO">🎧 audio</Badge>}
                {!r.transcript && <Badge tone="ATTENTION">transcript needed</Badge>}
                <ModeBadge mode={r.analysisMode} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
