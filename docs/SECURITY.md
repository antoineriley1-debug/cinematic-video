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

## Known gaps (tracked in REQUIREMENTS_TRACEABILITY.md — release blockers)
- **Rate limiting** (R42.7): not implemented; add a middleware limiter or
  platform-level WAF before production.
- **Dependency scanning** (R42.8): wire `npm audit` / Dependabot into CI.
- **CSRF**: Next server actions carry origin checks by default; keep forms on
  same-origin only (no cross-site POST surface today).
- **Encryption at rest / TLS**: production platform responsibility
  (DEPLOYMENT.md); SQLite dev file is not encrypted.
- **Login throttling**: constant-time comparison exists, but add attempt
  limits alongside rate limiting.
