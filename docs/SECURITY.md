# Security Model

## Authentication & sessions
- bcrypt cost 12; constant-shape login (bcrypt runs even for unknown emails).
- Sessions are DB rows; the cookie holds an HMAC-SHA256-signed random token
  (httpOnly, SameSite=Lax, Secure in production, 12h TTL). Logout deletes the
  server-side session. `SESSION_SECRET` must be ≥32 chars.
- `proxy.ts` is only an optimistic redirect; real verification is
  `requireUser()`/`requireAdmin()` in every page/action/route.

## Authorization
- Server-side on every read and mutation. Ownership guards: notes (private =
  author only, enforced at query level in search AND page level), memory
  (owner-only edit/delete), conversations (participant-only send/read),
  settings (admin-only).
- Search filters by permission **before** retrieval; the AI Chief of Staff
  retrieves through the same layer, so the model never sees unauthorized rows.
- Director pattern alerts expose counts/metadata only — never private
  narrative (tested).

## Secrets & AI
- API keys only in server env; provider modules are server-only imports;
  no `NEXT_PUBLIC_` secrets. AI calls are exclusively server-side.
- Prompt-injection defenses: all ingested content framed as data; JSON
  outputs validated; unparseable AI output falls back to deterministic
  processing instead of being trusted.

## Files & input
- Upload validation: size limit (admin-configurable `uploads.maxBytes`),
  MIME allowlist, filename traversal rejection; content-addressed storage
  (sha256) prevents duplicate blobs; downloads set `nosniff` and attachment
  disposition.
- All action inputs validated with zod enums / typed parsers; Prisma
  parameterizes SQL (no string interpolation anywhere).
- Output encoding via React JSX escaping; raw email/minutes rendered inside
  `<pre>{text}</pre>` (never `dangerouslySetInnerHTML`).

## Headers
X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy,
Permissions-Policy set globally in `next.config.ts`.

## Audit
Every material mutation writes `AuditLog` (actor, action, entity, before/
after snapshots, source). Logins, exports, setting changes, link
confirmations, infractions, and file entries are all audited.

## Rate limiting & login throttling
- **Application-layer limiter** (`src/lib/ratelimit.ts`): sliding window in
  the Node process — login server action per-IP (15/min) and API routes
  per-user (240/min, live-verified 429). Important: the Next 16
  proxy/middleware sandbox does NOT retain module or global state between
  requests, so limits must live in the app layer, not `proxy.ts`.
- **Durable login throttle** (`src/lib/loginThrottle.ts`): failed attempts
  recorded as LOGIN_FAILED audit rows per email; configurable
  `security.loginMaxFailures` / `security.loginWindowMinutes` settings block
  further attempts inside the window. Survives restarts.
- **Multi-instance note**: the in-memory limiter is per-process. Scaling to
  multiple instances requires a shared store (Redis) or platform WAF.

## Dependency scanning
`.github/workflows/ci.yml` runs `npm audit --audit-level=high` on every
push/PR after tests and the production build. The first audit surfaced real
high-severity advisories in Next 16.2.6 (middleware bypass, SSRF, cache
confusion); the framework was upgraded to 16.3.0 → 0 known vulnerabilities.

## Known gaps (tracked in REQUIREMENTS_TRACEABILITY.md)
- **CSRF**: Next server actions carry origin checks by default; keep forms on
  same-origin only (no cross-site POST surface today).
- **Encryption at rest / TLS**: production platform responsibility
  (DEPLOYMENT.md); SQLite dev file is not encrypted.
- **Shared rate-limit store** for multi-instance deployments (see above).
