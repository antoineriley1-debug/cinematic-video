import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { login, currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isRateLimited, LIMITS } from "@/lib/ratelimit";
import { btnCls, inputCls } from "@/components/ui";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await currentUser();
  if (user) redirect("/briefing");
  const { error } = await searchParams;
  // Fresh deployment guard: an unseeded database means every login fails —
  // say so plainly instead of "invalid password".
  const userCount = await prisma.user.count();

  async function doLogin(formData: FormData) {
    "use server";
    const headerStore = await headers();
    const ip = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || headerStore.get("x-real-ip") || "local";
    if (isRateLimited(`login:${ip}`, LIMITS.login)) redirect("/login?error=rate");
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const result = await login(email, password);
    if (!result.ok) {
      redirect(result.error?.includes("Too many") ? "/login?error=throttle" : "/login?error=1");
    }
    redirect("/briefing");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="text-xs font-bold uppercase tracking-[0.3em] text-blue-600">Crothall</div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Executive OS</h1>
          <p className="mt-2 text-sm text-slate-500">Connected executive operations &amp; intelligence</p>
        </div>
        {userCount === 0 && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            No user accounts exist yet — the database hasn&apos;t been seeded. On Render, open the service&apos;s
            <strong> Shell</strong> tab and run <code className="rounded bg-amber-100 px-1">npm run db:seed</code>,
            then refresh this page.
          </p>
        )}
        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error === "rate"
              ? "Too many attempts from this device. Wait a minute and try again."
              : error === "throttle"
                ? "Too many failed attempts for this account. Wait 15 minutes and try again."
                : "Invalid email or password."}
          </p>
        )}
        <form action={doLogin} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="mb-1 block text-sm font-medium text-slate-700">Email</label>
            <input id="login-email" name="email" type="email" required autoComplete="email" className={inputCls} />
          </div>
          <div>
            <label htmlFor="login-password" className="mb-1 block text-sm font-medium text-slate-700">Password</label>
            <input id="login-password" name="password" type="password" required autoComplete="current-password" className={inputCls} />
          </div>
          <button type="submit" className={`${btnCls} w-full justify-center`}>
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
