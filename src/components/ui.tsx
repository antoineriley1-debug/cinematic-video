import Link from "next/link";
import type { ReactNode } from "react";

export function Card({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between">
          {title && <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, action, help }: { title: string; subtitle?: string; action?: ReactNode; help?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        {help && (
          <Link href={`/training#${help}`} className="mt-1 inline-block text-xs font-medium text-blue-600 hover:underline">
            How do I use this? →
          </Link>
        )}
      </div>
      {action}
    </div>
  );
}

const BADGE_COLORS: Record<string, string> = {
  URGENT: "bg-red-100 text-red-800",
  CRITICAL: "bg-red-100 text-red-800",
  HIGH: "bg-orange-100 text-orange-800",
  ATTENTION: "bg-amber-100 text-amber-800",
  MEDIUM: "bg-amber-100 text-amber-800",
  NORMAL: "bg-slate-100 text-slate-700",
  LOW: "bg-slate-100 text-slate-600",
  INFO: "bg-blue-100 text-blue-800",
  POSITIVE: "bg-emerald-100 text-emerald-800",
  AI: "bg-violet-100 text-violet-800",
  EMERGENCY: "bg-red-100 text-red-800",
  OPEN: "bg-blue-100 text-blue-800",
  DONE: "bg-emerald-100 text-emerald-800",
  RESOLVED: "bg-emerald-100 text-emerald-800",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
};

export function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  const color = BADGE_COLORS[tone ?? ""] ?? "bg-slate-100 text-slate-700";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>{children}</span>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-400">{children}</p>;
}

export function SourceLink({ href, children }: { href: string; children?: ReactNode }) {
  return (
    <Link href={href} className="text-xs font-medium text-blue-600 hover:underline">
      {children ?? "View source →"}
    </Link>
  );
}

export const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none";
export const btnCls =
  "inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50";
export const btnSecondaryCls =
  "inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50";

export function ModeBadge({ mode }: { mode: string | null }) {
  if (!mode) return null;
  return mode === "EMERGENCY" ? (
    <Badge tone="EMERGENCY">Emergency Intelligence Mode</Badge>
  ) : (
    <Badge tone="AI">AI analyzed</Badge>
  );
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
