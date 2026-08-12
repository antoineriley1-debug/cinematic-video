import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/validate";
import { Card, PageHeader, EmptyState, inputCls, btnCls } from "@/components/ui";
import { askChiefAction } from "../actions";

export const dynamic = "force-dynamic";

const SUGGESTIONS = [
  "What needs my attention today?",
  "What happened last week?",
  "Which contracts are approaching expiration?",
  "What's sitting on my back burner?",
  "Show outstanding projects.",
];

export default async function ChiefPage({ searchParams }: { searchParams: Promise<{ thread?: string; prefill?: string }> }) {
  const user = await requireUser();
  const { thread: threadId, prefill } = await searchParams;
  const threads = await prisma.chiefThread.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 10 });
  const thread = threadId
    ? await prisma.chiefThread.findFirst({ where: { id: threadId, userId: user.id }, include: { messages: { orderBy: { createdAt: "asc" } } } })
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="AI Chief of Staff"
        help="ai-chief-of-staff"
        subtitle="Answers are grounded in your authorized records and always cite their sources."
      />

      {thread ? (
        <Card>
          <ul className="space-y-4">
            {thread.messages.map((m) => {
              const sources = parseJson<{ source: string; href: string }[]>(m.sourcesJson, []);
              return (
                <li key={m.id} className={m.role === "user" ? "text-right" : ""}>
                  <div className={`inline-block max-w-[90%] rounded-2xl px-4 py-3 text-sm ${m.role === "user" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800"}`}>
                    <p className="whitespace-pre-wrap text-left">{m.content}</p>
                    {sources.length > 0 && (
                      <div className="mt-2 border-t border-slate-200 pt-2 text-left">
                        <div className="text-xs font-semibold uppercase text-slate-400">Sources</div>
                        <ul className="mt-1 space-y-0.5">
                          {sources.map((s, i) => (
                            <li key={i}>
                              <Link href={s.href} className="text-xs text-blue-600 hover:underline">
                                [{i + 1}] {s.source}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        <Card>
          <EmptyState>Ask a question to start. Try one of the suggestions below.</EmptyState>
          <div className="flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <form key={s} action={askChiefAction}>
                <input type="hidden" name="question" value={s} />
                <button className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:border-blue-300 hover:text-blue-700">
                  {s}
                </button>
              </form>
            ))}
          </div>
        </Card>
      )}

      <form action={askChiefAction} className="flex gap-2">
        {thread && <input type="hidden" name="threadId" value={thread.id} />}
        <input name="question" defaultValue={prefill ?? ""} placeholder="Ask your Chief of Staff…" required className={inputCls} autoComplete="off" />
        <button className={btnCls}>Ask</button>
      </form>

      {threads.length > 0 && (
        <Card title="Recent conversations">
          <ul className="space-y-1 text-sm">
            {threads.map((t) => (
              <li key={t.id}>
                <Link href={`/chief?thread=${t.id}`} className={`hover:underline ${t.id === threadId ? "font-bold text-blue-700" : "text-slate-600"}`}>
                  {t.title ?? "Conversation"}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
