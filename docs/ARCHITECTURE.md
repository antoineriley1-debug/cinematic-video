# Architecture

## Stack
- **Next.js 16 (App Router)** — server components render every page; server
  actions handle mutations; route handlers serve exports, files, and health.
- **Prisma + SQLite (dev) / PostgreSQL (prod)** — single relational source of
  truth. No enums on SQLite, so status/category strings are validated by zod
  in `src/lib/validate.ts`.
- **Tailwind CSS 4** — UI.
- **Vitest** — unit/integration tests against a throwaway SQLite database.

## Layering
```
UI (server components, src/app)
  └── server actions (src/app/(app)/actions.ts)  ← authn/authz + zod validation
        └── domain services (src/lib/services/*) ← business rules, audit, activity
              └── platform libs (src/lib/*)      ← auth, links, settings, notify, search, storage
                    └── Prisma (src/lib/db.ts)   ← single source of truth
AI: business modules → capabilities (src/lib/ai/capabilities.ts)
     → orchestrator (routing/health/failover/queue) → providers (anthropic|openai|mock)
     → deterministic emergency engine on total outage
```

## EVERYTHING CONNECTS
Primary structure uses explicit relations (Site↔Director, Vendor↔Contract,
etc.). Cross-module connections use the polymorphic `Link` table
(`fromType/fromId ↔ toType/toId`, unique per pair) with a `confirmed` flag:
AI-suggested links are stored unconfirmed and become permanent only after
human confirmation (`src/lib/links.ts`). Comments, flags, acknowledgements,
activity events, audit rows, and stored files all address entities by
`(entityType, entityId)`, so every major object supports discussion, private
flags, per-user acknowledgement, and audit without per-module plumbing.

## Module boundaries
- `services/emails.ts` — ingestion (intentional submission only), duplicate
  detection, analysis, suggestion links, timelines, export.
- `services/directors.ts` — director file, infraction engine (configurable
  rule from Settings), cross-executive pattern detection (metadata only).
- `services/vendors.ts` — performance records, cross-site pattern alerts.
- `services/contracts.ts` — configurable renewal watch, countdowns,
  per-executive acknowledgements.
- `services/meetings.ts` / `services/plaud.ts` — upload → analysis → action
  items; next-day briefing feed.
- `services/briefing.ts` — personalized briefing assembly + ack semantics +
  history persistence + export.
- `services/messaging.ts` — conversations, unread state, object sharing,
  conversation briefs.
- `services/chief.ts` — permission-aware retrieval + grounded answering.
- `services/exports.ts` — attributed text reports.

## Events & async
Material actions synchronously write `AuditLog` + `ActivityEvent` +
`Notification` rows inside the request. AI work that cannot complete during a
total provider outage is queued in `AiQueueItem` (drain worker is an open
item — see traceability R8.7). This keeps one source of truth and no message
broker dependency; a queue/broker can be introduced behind the same service
seams when scale requires it.

## Scalability path
- Swap SQLite → PostgreSQL (documented in DEPLOYMENT.md).
- Search currently uses SQL `contains` per entity behind `lib/search.ts`; the
  interface is a single function, so Postgres FTS/pgvector or an external
  index can replace the implementation without touching callers.
- Real-time messaging currently refresh/poll-based; SSE/WebSocket can be added
  at the layout level without changing messaging services.
