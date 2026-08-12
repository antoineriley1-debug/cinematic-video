import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, logout } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOrchestrator } from "@/lib/ai/orchestrator";
import { unreadCount } from "@/lib/services/messaging";
import { drainAiQueue } from "@/lib/services/aiQueue";
import LiveRefresh from "@/components/LiveRefresh";

const NAV = [
  { href: "/briefing", label: "Daily Briefing" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/sites", label: "Sites" },
  { href: "/directors", label: "Directors" },
  { href: "/vendors", label: "Vendors" },
  { href: "/contracts", label: "Contracts" },
  { href: "/projects", label: "Projects" },
  { href: "/actions", label: "Actions & Deadlines" },
  { href: "/emails", label: "Email Intelligence" },
  { href: "/meetings", label: "Meeting Minutes" },
  { href: "/plaud", label: "Plaud Recordings" },
  { href: "/notes", label: "Notes" },
  { href: "/messages", label: "Messages" },
  { href: "/chief", label: "AI Chief of Staff" },
  { href: "/calendar", label: "Activity Calendar" },
  { href: "/memory", label: "Memory" },
  { href: "/training", label: "Training Center" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [unreadNotifications, unreadMessages, orchestrator] = await Promise.all([
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    unreadCount(prisma, user.id),
    getOrchestrator(prisma),
  ]);
  const aiUp = orchestrator.aiAvailable();

  // Opportunistic background drain: if AI is available and outage-queued
  // work exists, re-process it without blocking the page.
  if (aiUp) {
    const queued = await prisma.aiQueueItem.count({ where: { status: "QUEUED" } });
    if (queued > 0) void drainAiQueue(prisma, orchestrator).catch(() => {});
  }

  async function doLogout() {
    "use server";
    await logout();
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen">
      <LiveRefresh />
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-900 text-slate-300 md:flex">
        <div className="px-5 py-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-blue-400">Crothall</div>
          <div className="text-lg font-bold text-white">Executive OS</div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3 pb-4">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center justify-between rounded-lg px-3 py-1.5 text-sm hover:bg-slate-800 hover:text-white"
            >
              {item.label}
              {item.href === "/messages" && unreadMessages > 0 && (
                <span className="rounded-full bg-blue-600 px-1.5 text-xs text-white">{unreadMessages}</span>
              )}
            </Link>
          ))}
          {user.role === "ADMIN" && (
            <Link href="/admin" className="flex rounded-lg px-3 py-1.5 text-sm text-amber-300 hover:bg-slate-800">
              Admin Console
            </Link>
          )}
        </nav>
        <div className="border-t border-slate-800 p-4 text-xs">
          <div className="font-medium text-white">{user.name}</div>
          <div className="text-slate-500">{user.title}</div>
          <form action={doLogout}>
            <button className="mt-2 text-slate-400 hover:text-white">Sign out</button>
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 border-b border-slate-200 bg-white px-6 py-3">
          <form action="/search" method="GET" className="max-w-md flex-1">
            <input
              name="q"
              placeholder="Search everything — sites, directors, vendors, contracts, emails, notes…"
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            />
          </form>
          <div className="ml-auto flex items-center gap-3">
            {!aiUp && (
              <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
                Emergency Intelligence Mode
              </span>
            )}
            <Link href="/notifications" className="relative rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
              Notifications
              {unreadNotifications > 0 && (
                <span className="absolute -right-1.5 -top-1.5 rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">
                  {unreadNotifications}
                </span>
              )}
            </Link>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
