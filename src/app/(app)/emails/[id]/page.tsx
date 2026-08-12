import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { linksFor } from "@/lib/links";
import { hrefFor } from "@/lib/services/briefing";
import { parseJson, Personalities, DirectorFileClassifications } from "@/lib/validate";
import { PERSONALITY_PROFILES } from "@/lib/ai/personalities";
import { Card, PageHeader, Badge, EmptyState, ModeBadge, inputCls, btnCls, btnSecondaryCls, fmtDateTime } from "@/components/ui";
import { draftReplyAction, confirmLinkAction, rejectLinkAction, addDirectorFileEntryAction } from "../../actions";

export const dynamic = "force-dynamic";

async function nameForRef(type: string, id: string): Promise<string> {
  switch (type) {
    case "SITE": return (await prisma.site.findUnique({ where: { id } }))?.name ?? "site";
    case "DIRECTOR": return (await prisma.director.findUnique({ where: { id } }))?.name ?? "director";
    case "VENDOR": return (await prisma.vendor.findUnique({ where: { id } }))?.name ?? "vendor";
    case "CONTRACT": return (await prisma.contract.findUnique({ where: { id } }))?.title ?? "contract";
    case "PROJECT": return (await prisma.project.findUnique({ where: { id } }))?.name ?? "project";
    default: return type.toLowerCase();
  }
}

export default async function EmailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const email = await prisma.emailMessage.findUnique({ where: { id }, include: { drafts: { orderBy: { createdAt: "desc" } } } });
  if (!email) notFound();

  const attachments = await prisma.storedFile.findMany({ where: { entityType: "EMAIL", entityId: id } });
  const allLinks = await linksFor(prisma, { type: "EMAIL", id });
  const pending = allLinks.filter((l) => !l.link.confirmed);
  const confirmed = allLinks.filter((l) => l.link.confirmed);
  const pendingNamed = await Promise.all(pending.map(async (l) => ({ ...l, name: await nameForRef(l.other.type, l.other.id) })));
  const confirmedNamed = await Promise.all(confirmed.map(async (l) => ({ ...l, name: await nameForRef(l.other.type, l.other.id) })));
  const directors = await prisma.director.findMany({ orderBy: { name: "asc" } });

  const bullets = parseJson<string[]>(email.bulletsJson, []);
  const actions = parseJson<string[]>(email.actionsJson, []);
  const dates = parseJson<{ text: string }[]>(email.datesJson, []);
  const people = parseJson<string[]>(email.peopleJson, []);
  const to = parseJson<string[]>(email.toJson, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title={email.subject ?? "(no subject)"}
        help="corrective-email"
        subtitle={`From ${email.fromName || email.fromAddress || "unknown"} · ${fmtDateTime(email.sentAt ?? email.createdAt)}${to.length ? ` · to ${to.join(", ")}` : ""}`}
        action={
          <div className="flex items-center gap-2">
            {email.urgency && <Badge tone={email.urgency}>{email.urgency}</Badge>}
            <ModeBadge mode={email.analysisMode} />
          </div>
        }
      />

      {pendingNamed.length > 0 && (
        <Card title="Confirm suggested relationships">
          <p className="mb-2 text-xs text-slate-500">
            {email.analysisMode === "EMERGENCY" ? "Deterministic analysis" : "AI"} suggested these connections. They
            become permanent only after you confirm them.
          </p>
          <ul className="space-y-2">
            {pendingNamed.map((l) => (
              <li key={l.link.id} className="flex items-center gap-3 text-sm">
                <Badge tone="INFO">{l.other.type}</Badge>
                <span className="flex-1 text-slate-800">{l.name}</span>
                <form action={confirmLinkAction}>
                  <input type="hidden" name="linkId" value={l.link.id} />
                  <input type="hidden" name="path" value={`/emails/${email.id}`} />
                  <button className={btnCls}>Confirm</button>
                </form>
                <form action={rejectLinkAction}>
                  <input type="hidden" name="linkId" value={l.link.id} />
                  <input type="hidden" name="path" value={`/emails/${email.id}`} />
                  <button className={btnSecondaryCls}>Reject</button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Analysis${email.analysisMode === "EMERGENCY" ? " — Emergency Intelligence Mode (rule-based, not full AI reasoning)" : ""}`}>
          <p className="text-sm text-slate-800">{email.summary ?? "Not analyzed yet."}</p>
          <div className="mt-3 space-y-2 text-sm">
            {email.intent && <div><span className="text-xs font-semibold uppercase text-slate-400">Intent</span> <Badge tone="INFO">{email.intent}</Badge></div>}
            {bullets.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase text-slate-400">Key points</div>
                <ul className="mt-1 list-disc pl-5 text-slate-700">{bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
              </div>
            )}
            {actions.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase text-slate-400">Actions</div>
                <ul className="mt-1 list-disc pl-5 text-slate-700">{actions.map((a, i) => <li key={i}>{a}</li>)}</ul>
              </div>
            )}
            {dates.length > 0 && (
              <div>
                <span className="text-xs font-semibold uppercase text-slate-400">Dates</span>{" "}
                {dates.map((d, i) => <Badge key={i} tone="ATTENTION">{d.text}</Badge>)}
              </div>
            )}
            {people.length > 0 && (
              <div>
                <span className="text-xs font-semibold uppercase text-slate-400">People</span>{" "}
                <span className="text-slate-700">{people.join(", ")}</span>
              </div>
            )}
          </div>
          {confirmedNamed.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <div className="text-xs font-semibold uppercase text-slate-400">Confirmed connections</div>
              <ul className="mt-1 space-y-1 text-sm">
                {confirmedNamed.map((l) => (
                  <li key={l.link.id}>
                    <Link href={hrefFor(l.other.type, l.other.id)} className="text-blue-700 hover:underline">
                      {l.other.type.toLowerCase()}: {l.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card title="Original email (preserved verbatim)">
          {attachments.length > 0 && (
            <ul className="mb-3 flex flex-wrap gap-2">
              {attachments.map((f) => (
                <li key={f.id}>
                  <a href={`/api/files/${f.id}`} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-blue-700 hover:bg-slate-100">
                    📎 {f.filename} ({Math.ceil(f.size / 1024)} KB)
                  </a>
                </li>
              ))}
            </ul>
          )}
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
            {email.bodyText || email.rawSource}
          </pre>
        </Card>
      </div>

      <Card title="Draft a response — personality engine">
        <form action={draftReplyAction} className="grid gap-3 md:grid-cols-4">
          <input type="hidden" name="emailId" value={email.id} />
          <select name="personality" className={inputCls}>
            {Personalities.map((p) => (
              <option key={p} value={p}>{PERSONALITY_PROFILES[p].label}</option>
            ))}
          </select>
          <input name="expectedAction" placeholder="Expected action (optional)" className={inputCls} />
          <input name="completionDate" placeholder="Completion date (optional)" className={inputCls} />
          <button className={btnCls}>Draft reply</button>
        </form>
        {email.drafts.length > 0 && (
          <div className="mt-4 space-y-3">
            {email.drafts.map((d) => (
              <div key={d.id} className="rounded-lg border border-slate-200 p-3">
                <div className="mb-1 flex items-center gap-2 text-xs">
                  <Badge tone="INFO">{PERSONALITY_PROFILES[d.personality as keyof typeof PERSONALITY_PROFILES]?.label ?? d.personality}</Badge>
                  <ModeBadge mode={d.mode} />
                  <span className="text-slate-400">{fmtDateTime(d.createdAt)}</span>
                </div>
                <pre className="whitespace-pre-wrap text-sm text-slate-700">{d.content}</pre>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Add to Director File">
        <form action={addDirectorFileEntryAction} className="grid gap-3 md:grid-cols-4">
          <input type="hidden" name="sourceType" value="EMAIL" />
          <input type="hidden" name="sourceId" value={email.id} />
          <select name="directorId" required className={inputCls}>
            <option value="">Select director…</option>
            {directors.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <select name="classification" className={inputCls}>
            {DirectorFileClassifications.map((c) => (
              <option key={c} value={c}>{c.replaceAll("_", " ")}</option>
            ))}
          </select>
          <input name="content" placeholder="File entry note" required className={inputCls} />
          <button className={btnCls}>Add to file</button>
        </form>
        <p className="mt-2 text-xs text-slate-400">
          Classifying as INFRACTION here is your explicit human confirmation — AI never files infractions on its own.
        </p>
      </Card>
    </div>
  );
}
