# Crothall Executive OS — project instructions

Connected executive operations & intelligence platform. Next.js 16 (App
Router) + Prisma (SQLite dev / Postgres prod) + Tailwind 4 + Vitest.

## Before coding
- Next.js 16 has breaking changes vs training data: `params`/`searchParams`
  and `cookies()` are async (`await`), middleware is `proxy.ts`. Docs live in
  `node_modules/next/dist/docs/`.
- Read `docs/MASTER_SPEC.md` (requirements) and
  `docs/REQUIREMENTS_TRACEABILITY.md` (status register) before changing
  behavior. Update the register and `BUILD_STATUS.md` when you change status.

## Conventions
- Mutations go through server actions in `src/app/(app)/actions.ts` →
  domain services in `src/lib/services/*`. Services take `db: Db` as their
  first argument so tests can inject the test database.
- Every material mutation writes `AuditLog` (`lib/audit.ts`) and, when
  user-meaningful, `ActivityEvent` (`lib/activity.ts`).
- Enum-like strings are validated via `src/lib/validate.ts` (SQLite has no
  Prisma enums). New status values go there first.
- Cross-module relationships use `lib/links.ts`; AI-suggested links must be
  created with `confirmed: false` and require human confirmation.
- AI access only via `lib/ai/capabilities.ts` — never call providers
  directly from business code. Deterministic fallbacks are mandatory and
  must be labeled `mode: "EMERGENCY"`.
- Permissions are enforced in queries (see `lib/search.ts`), never only in UI.

## Commands
```
npm test          # vitest (recreates prisma/test.db per file; no --force-reset)
npm run build     # production gate
npm run db:push   # sync schema (dev)
npm run db:seed   # demo data; logins printed at end
```
