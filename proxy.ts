// Optimistic auth gate (Next 16 "proxy", formerly middleware). Real session
// verification happens server-side in requireUser(). Rate limiting is NOT
// done here: this sandbox does not retain module or global state between
// requests, so limits are enforced in the Node application layer
// (src/lib/ratelimit.ts — login action and API routes) where state persists.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/health"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  const hasSession = request.cookies.has("ceos_session");
  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
