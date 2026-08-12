import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { TRAINING_MODULES } from "@/lib/training";
import { voiceConfigured } from "@/lib/voice";

export const dynamic = "force-dynamic";

export default async function TrainingPage() {
  await requireUser();
  const voice = voiceConfigured();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Training Center" subtitle="Welcome to Crothall Executive OS" />

      <Card title="Welcome to Crothall Executive OS">
        <div className="space-y-3 text-sm leading-relaxed text-slate-700">
          <p className="text-base font-medium text-slate-900">I&apos;m here to help you.</p>
          <p>
            I&apos;m part of your daily operating environment — not another software system to maintain. My job is to
            organize your information, surface what matters, preserve context, connect your work, and reduce your
            administrative burden.
          </p>
          <p>
            Every morning I open with your personal briefing: what needs your attention, why it matters, what should
            happen next, and where each item came from. During the day, hand me the emails you choose to share, your
            meeting minutes, and your Plaud recordings — I&apos;ll turn them into connected intelligence across your
            sites, directors, vendors, and contracts. Nothing lives in a silo: an email about a vendor links to the
            vendor, the contract, the site, and your briefing.
          </p>
          <p>
            Ask my Chief of Staff anything — the answer always comes from your own records, with sources you can open.
          </p>
          {voice ? (
            <audio controls preload="none" src="/api/voice/welcome" className="mt-2 w-full" />
          ) : (
            <p className="text-xs text-slate-400">
              Narrated walkthroughs in a natural professional voice activate when a voice provider is configured
              (Admin Console → External integrations). The written walkthroughs below cover every major workflow today.
            </p>
          )}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {TRAINING_MODULES.map((m) => (
          <div key={m.title} id={m.slug} className="scroll-mt-6">
            <Card title={m.title}>
              <p className="text-sm leading-relaxed text-slate-600">{m.body}</p>
              <a href={m.href} className="mt-2 inline-block text-xs font-medium text-blue-600 hover:underline">
                Try it now →
              </a>
              {voice && <audio controls preload="none" src={`/api/voice/${m.slug}`} className="mt-2 w-full" />}
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}
