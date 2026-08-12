// In-memory sliding-window rate limiter for the Node application layer
// (server actions and API route handlers), where module state persists for
// the life of the server process. The proxy/middleware sandbox does NOT
// retain state between requests in this runtime, so limits are enforced
// here — the authoritative, testable layer. For multi-instance deployments
// add a shared store or platform WAF (see docs/SECURITY.md).

const store = globalThis as unknown as {
  __ceosRate?: Map<string, { count: number; resetAt: number }>;
};
const buckets = (store.__ceosRate ??= new Map());

export const LIMITS = {
  login: 15, // attempts/min/IP
  api: 240, // API requests/min/user
} as const;

/** Returns true when the caller has exceeded `limit` events per window. */
export function isRateLimited(key: string, limit: number, windowMs = 60_000, now = Date.now()): boolean {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size > 50_000) buckets.clear(); // bounded memory
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  bucket.count++;
  return bucket.count > limit;
}

/** Test hook: clear all buckets. */
export function resetRateLimits(): void {
  buckets.clear();
}
