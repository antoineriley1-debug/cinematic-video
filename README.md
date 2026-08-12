# Crothall Executive OS

A connected executive operations and intelligence platform for Crothall
corporate leadership. **Everything connects** — emails, sites, directors,
vendors, contracts, projects, meetings, Plaud recordings, notes, deadlines,
briefings, and an AI Chief of Staff share one relational fabric instead of
living in silos.

## Highlights
- **Daily Executive Briefing** — personalized opening experience with
  per-executive acknowledgements and contract renewal countdowns.
- **Email Intelligence** — drag emails in (never inbox sync); analysis,
  duplicate detection, human-confirmed entity linking, chronological
  multi-email timelines, and 12-personality response drafting.
- **Director & Vendor Intelligence** — director files with a configurable
  infraction engine, cross-executive pattern alerts (metadata only), vendor
  performance records with cross-site pattern detection.
- **AI Orchestration** — Anthropic/OpenAI behind a capability abstraction
  with health checks, automatic failover, and a deterministic Emergency
  Intelligence Engine when every provider is down (work queued, nothing lost,
  honestly labeled).
- **Grounded AI Chief of Staff** — answers only from authorized records,
  with source links.
- **Auditability** — every material action lands in the audit log and the
  executive activity calendar.

## Quick start
```bash
npm ci
cp .env.example .env         # set SESSION_SECRET; AI keys optional
npx prisma db push
npm run db:seed              # prints demo logins
npm run dev                  # http://localhost:3000
```
Demo login: `antoine@crothall-demo.local` / `crothall-demo-2026` (admin).

Without AI keys the platform runs fully in deterministic Emergency
Intelligence Mode — add `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` to activate
live AI and failover.

## Tests
```bash
npm test        # 47 tests: services, failover, emergency mode, integration chain
```

## Documentation
| Doc | Contents |
|---|---|
| `docs/MASTER_SPEC.md` | Authoritative requirements |
| `docs/REQUIREMENTS_TRACEABILITY.md` | Requirement register + statuses + evidence |
| `docs/ARCHITECTURE.md` / `docs/DATA_MODEL.md` | System & schema design |
| `docs/AI_ARCHITECTURE.md` | Orchestration, failover, emergency engine |
| `docs/SECURITY.md` | Security model + known gaps |
| `docs/TEST_STRATEGY.md` / `docs/DEPLOYMENT.md` | Testing & operations |
| `BUILD_STATUS.md` | Honest current status incl. release-gate blockers |
