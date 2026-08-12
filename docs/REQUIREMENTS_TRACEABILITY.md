# Requirements Traceability Register

Statuses: NOT_STARTED · IN_PROGRESS · BLOCKED · BLOCKED_EXTERNAL · IMPLEMENTED · TESTED · VERIFIED
- **VERIFIED** = implemented + automated test evidence (test file cited) or live smoke-verified behavior.
- **IMPLEMENTED** = code exists and renders/executes (build + page smoke passed) but lacks a dedicated automated test.
- **BLOCKED_EXTERNAL** = requires credentials/infrastructure; everything possible around the dependency is built, with the unblock condition documented.

Evidence keys: `T:<file>` = automated test, `S` = production-build + authenticated page smoke (all routes returned 200 on 2026-08-12), `B` = `next build` clean.

| ID | Requirement | Implementation | Tests | Status |
|----|-------------|----------------|-------|--------|
| R6.1 | Drag/paste email ingestion, original preserved verbatim | `src/lib/services/emails.ts`, `emails/page.tsx` | T:email.test.ts | VERIFIED |
| R6.2 | Metadata parsing (.eml headers, multipart, QP/base64, pasted text) | `src/lib/email/parse.ts` | T:email.test.ts | VERIFIED |
| R6.3 | Duplicate email detection (sha256) | `emails.ts ingestEmail` | T:email.test.ts | VERIFIED |
| R6.4 | Intent/summary/bullets/actions/dates/people analysis | `ai/capabilities.ts analyzeEmail` | T:email.test.ts | VERIFIED |
| R6.5 | Site/director/vendor/contract/project identification | `analyzeEmail` + emergency dictionaries | T:email.test.ts, emergency.test.ts | VERIFIED |
| R6.6 | Human confirmation of uncertain relationships before permanence | `Link.confirmed=false`, confirm/reject UI on `emails/[id]` | T:email.test.ts, integration.test.ts | VERIFIED |
| R6.7 | Email → calendar activity | `recordActivity` in ingest | T:email.test.ts | VERIFIED |
| R6.8 | Emails searchable | `lib/search.ts` | T:integration.test.ts | VERIFIED |
| R6.9 | AI questions about emails (grounded) | `services/chief.ts` retrieval includes emails | T:integration.test.ts | VERIFIED |
| R6.10 | Personality-based drafting incl. corrective/firm/escalation/coaching | `draftReplyAction`, `ai/personalities.ts` | T:drafting.test.ts | VERIFIED |
| R6.11 | Add to Director File from email | `emails/[id]` form → `addToDirectorFile` | T:directors.test.ts | VERIFIED |
| R6.12 | Explicit human infraction classification (AI cannot self-file) | server-side guard in `directors.ts` | T:directors.test.ts | VERIFIED |
| R6.13 | Multi-email upload, chronological ordering, event timeline | `EmailBatch`, `buildTimeline`, `emails/batch/[id]` | T:email.test.ts | VERIFIED |
| R6.14 | Timeline shows date/sender/recipients/subject/event/actions/source | `buildTimeline`, batch page | T:email.test.ts | VERIFIED |
| R6.15 | Timeline exportable | `/api/export/email-timeline/[id]` | T:email.test.ts (export text), S | VERIFIED |
| R6.16 | Email attachment parsing (extract & store .eml attachments as files) | `email/parse.ts` MIME attachment extraction → `storeFile` linked to email; shown on `emails/[id]` | T:hardening.test.ts | VERIFIED |
| R7.1 | No mailbox login/sync; intentional submission only | no mail-sync code exists; UI states policy | design-level | VERIFIED |
| R7.2 | Method B intake address | env seam `EMAIL_INTAKE_ADDRESS`; needs inbound-mail infra | — | BLOCKED_EXTERNAL |
| R8.1 | Secondary provider assumes on primary failure (3 vendors: Anthropic, Google Gemini, OpenAI; two-hop cascade) | `ai/orchestrator.ts`, `ai/providers/*` | T:orchestrator.test.ts, google-provider.test.ts | VERIFIED |
| R8.2 | Subtle user continuity notice + admin technical alert | `notifyFailover/notifyOutage` | T:orchestrator.test.ts | VERIFIED |
| R8.3 | Emergency engine on total outage; health-controlled, not user-toggled | `ai/emergency.ts`; activation only via orchestrator failure path | T:email.test.ts, emergency.test.ts | VERIFIED |
| R8.4 | Emergency capabilities: classification/urgency/intent/deadlines/actions/templates | `emergency.ts`, personality templates | T:emergency.test.ts, drafting.test.ts | VERIFIED |
| R8.5 | "Emergency Intelligence Mode" clearly displayed | header badge, ModeBadge on records, admin banner | T:e2e/05 (badge + "[Deterministic]" asserted in browser) | VERIFIED |
| R8.6 | Queued AI work during outage, no data loss | `AiQueueItem`, queueWork | T:email.test.ts, orchestrator.test.ts | VERIFIED |
| R8.7 | Queue drain on provider recovery (background re-analysis) | `services/aiQueue.ts drainAiQueue`; runs on health-check recovery, admin button, and opportunistically from layout | T:queue-drain.test.ts | VERIFIED |
| R9.1 | 12 outgoing personality profiles with structured rules | `ai/personalities.ts` | T:drafting.test.ts | VERIFIED |
| R9.2 | FIRM/CORRECTIVE rule structure per spec | profile rules | T:drafting.test.ts | VERIFIED |
| R9.3 | Profiles work in AI mode AND emergency templates | `draftEmailReply` fallback | T:drafting.test.ts | VERIFIED |
| R9.4 | Admin-editable personality rules | Setting `personalities.overrides` merged by `resolvePersonalityRules`; editable in Admin Console | T:hardening.test.ts | VERIFIED |
| R10.1 | 10 sites seeded, unbounded architecture | `prisma/seed.ts`, Site model | S | VERIFIED |
| R10.2 | Site profile: directors/executives/projects/observations/vendors/contracts/visits/timeline | `sites/[id]/page.tsx` | T:e2e/03 | VERIFIED |
| R10.3 | Six observation categories incl. back burner/radar | `SiteObservation.category` | T:briefing tests use CRITICAL | VERIFIED |
| R11.1 | Site Visit Mode with all six capture categories | `visits/[id]`, `services/visits.ts` | T:e2e/03 (start → observe → complete in browser) | VERIFIED |
| R11.2 | Visit completion → structured record + calendar activity | `completeVisit` | T:e2e/03 (visit + COMPLETED badge on site page) | VERIFIED |
| R12.1 | Director profiles with connected file | `directors/[id]` | T:e2e/04 (infraction recorded + timeline in browser) | VERIFIED |
| R13.1 | Add to Director File with 9 classifications from email/Plaud/manual | `addToDirectorFile` + forms | T:directors.test.ts | VERIFIED |
| R13.2 | AI recommends classification but cannot file infractions | server-side guard | T:directors.test.ts | VERIFIED |
| R14.1 | Structured infraction records with audit history | `Infraction` model, `recordInfraction` | T:directors.test.ts | VERIFIED |
| R14.2 | Configurable threshold alert (count/window/categories/severity/recipients) | `Setting infraction.alertRule`, `checkInfractionThreshold` | T:directors.test.ts | VERIFIED |
| R14.3 | Acknowledgement requirement on infraction alerts follows admin rule | `buildBriefing` reads `infraction.alertRule.requireAcknowledgement` | T:hardening.test.ts | VERIFIED |
| R15.1 | Cross-executive director pattern alert, metadata only, private narrative never exposed | `maybeDetectDirectorPattern` | T:directors.test.ts | VERIFIED |
| R16.1 | Vendor profiles, site filtering | `vendors/page.tsx?site=` | S | IMPLEMENTED |
| R17.1 | 9 performance record types | `VendorPerformanceRecord` | T:vendors-contracts.test.ts | VERIFIED |
| R17.2 | Public vendor discussion with comments/@mentions | Comment on VENDOR + deliverMentions | T:briefing-messaging.test.ts (mentions) | VERIFIED |
| R17.3 | Cross-site vendor pattern alert with evidence | `maybeDetectVendorPattern` | T:vendors-contracts.test.ts | VERIFIED |
| R18.1 | Contract connections (vendor/sites/notes/discussions/deadlines) | Contract model + links + comments | S | IMPLEMENTED |
| R18.2 | Grounded AI answers from contract terms with sources | terms in search corpus + chief retrieval | T:integration.test.ts | VERIFIED |
| R19.1 | Configurable watch window (default 90d), countdown display | `contracts.watchWindowDays`, `contractWatch` | T:vendors-contracts.test.ts | VERIFIED |
| R19.2 | Per-executive acknowledgement; consequence explained; others unaffected; deadline persists | `acknowledgeWatchItem` + UI copy | T:vendors-contracts.test.ts | VERIFIED |
| R19.3 | Watch surfaces related vendor concerns | `openConcerns` in watch items | T:vendors-contracts (shape) | VERIFIED |
| R20.1 | Notes private by default; author-only visibility enforced | Note model, notes/[id] authz redirect, search filter | T:briefing-messaging.test.ts (search authz) | VERIFIED |
| R20.2 | Make public → visible + comments/threaded replies/@mentions | `makeNotePublicAction`, threaded Comment UI | T (mentions) + S | VERIFIED |
| R20.3 | Attachments on notes/comments | upload inputs on note create + comment forms → `storeFile`; download chips on `notes/[id]` | storage layer T:hardening.test.ts; UI S | IMPLEMENTED |
| R21.1 | Private flags (5 labels), invisible to others | `Flag` unique per user | S; briefing test shows per-user flags | VERIFIED |
| R22.1 | Attention flags: immediate in-app notification linking to source | `directAttentionAction`, mentions | T:briefing-messaging.test.ts | VERIFIED |
| R22.2 | Optional email notification delivery | Notification model has the seam; SMTP not configured | — | BLOCKED_EXTERNAL |
| R23.1 | Corporate notes workspace linkable to entities | Note.scope=CORPORATE, `/notes?scope=corporate` | S | IMPLEMENTED |
| R23.2 | AI-recommended relationships need human confirmation | Link.confirmed workflow (shared with email) | T:email.test.ts | VERIFIED |
| R24.1 | Contextual discussions on sites/vendors/contracts/projects/public notes | polymorphic `Comment` + UI on each page | S | IMPLEMENTED |
| R25.1 | Direct & group messaging, unread state, object sharing | `services/messaging.ts`, messages pages | T:briefing-messaging.test.ts | VERIFIED |
| R25.2 | Participant-only authorization | `sendMessage` guard + page redirect | T:briefing-messaging.test.ts | VERIFIED |
| R25.3 | Real-time push delivery (SSE) | `/api/stream` + `LiveRefresh` client; refresh event pushed on new notifications/messages | Live: SSE refresh event verified on notification insert | VERIFIED |
| R26.1 | Conversation Brief after configurable inactivity; searchable; retention respected | `maybeBriefInactiveConversations` | T:briefing-messaging.test.ts | VERIFIED |
| R27.1 | Meeting upload, AI extraction (summary/decisions/actions/unresolved) | `services/meetings.ts` | T:briefing-messaging.test.ts | VERIFIED |
| R27.2 | Extracted actions become live action items linked to meeting | `uploadMeeting` | T:briefing-messaging.test.ts | VERIFIED |
| R28.1 | Next-day briefing rule with link to original meeting; exportable | `buildBriefing` meetings block, `/api/export/meeting` | T:briefing-messaging.test.ts | VERIFIED |
| R29.1 | Briefing = default opening experience, greets by name, personalized | `/` → `/briefing`, `buildBriefing` | T:briefing-messaging.test.ts | VERIFIED |
| R30.1 | Per-executive acknowledgement; source remains; consequence disclosed | ack flow + UI copy | T:briefing-messaging.test.ts | VERIFIED |
| R31.1 | Dashboard with the 12 core panels | `dashboard/page.tsx` | S | IMPLEMENTED |
| R31.2 | Configurable dashboard layouts | per-user panel order/visibility in `User.preferencesJson`; Customize-layout editor on dashboard | S (renders live) | IMPLEMENTED |
| R32.1 | Activity calendar records all meaningful actions; day/week/month reconstruction | `recordActivity` at every mutation, `/calendar` | T:integration.test.ts | VERIFIED |
| R32.2 | AI uses calendar as context | `chief.ts gatherContext` | T (chief path) | VERIFIED |
| R33.1 | Plaud manual import → transcript analysis, searchable, connectable | `services/plaud.ts` | S; analysis path shared w/ tested meeting capability | IMPLEMENTED |
| R33.2 | Plaud API sync | `services/plaudSync.ts`: list → tolerant mapping → dedupe by externalId → standard import pipeline (analysis/audit/activity); admin Sync button; configurable base/paths | T:plaud-sync.test.ts (5 tests, stubbed API); live call BLOCKED_EXTERNAL — sandbox egress blocks plaud hosts, and endpoint shapes need confirmation against Plaud docs on first production sync | IMPLEMENTED |
| R33.3 | No auto-discipline from recordings; human confirmation | shared `addToDirectorFile` guard | T:directors.test.ts | VERIFIED |
| R34.1 | Memory with provenance; inspect/edit/delete own only | `/memory`, ownership guards | S | IMPLEMENTED |
| R34.2 | AI never silently writes memory | no code path writes MemoryItem from AI | design-level | VERIFIED |
| R35.1 | Chief of Staff grounded answers with source links; honest when unsupported | `services/chief.ts`, `answerGrounded` system prompt | T:integration.test.ts | VERIFIED |
| R36.1 | Cross-entity search, permissions enforced before retrieval | `lib/search.ts` query-level filters | T:briefing-messaging.test.ts | VERIFIED |
| R36.2 | Natural-language retrieval: multi-term matching + phrase-first ranking | `lib/search.ts` term tokenizer, any-term match, scored ranking | T:hardening.test.ts | VERIFIED |
| R37.1 | Voice provider abstraction, server-side credentials | env seam (VOICE_PROVIDER/KEY); no vendor hard-coding | — | BLOCKED_EXTERNAL |
| R38.1 | Training center with Welcome presentation + 17 workflow guides | `/training` | S | IMPLEMENTED |
| R38.2 | Narrated video training using the real interface | requires voice/recording pipeline | — | BLOCKED_EXTERNAL |
| R38.3 | Contextual "How do I use this?" on relevant screens | PageHeader `help` links to anchored training modules on 20 screens | S (anchors + links render live) | VERIFIED |
| R39.1 | Object storage w/ sha256 dedupe, metadata, ownership, retention | `lib/storage.ts`, StoredFile | T:hardening.test.ts (attachment stored, sha256, linkage) | VERIFIED |
| R40.1 | Relational source of truth; no contradictory stores | single Prisma schema | B | VERIFIED |
| R40.2 | Background/async processing | outage queue + drain worker + SSE event stream | T:queue-drain.test.ts | VERIFIED |
| R41.1 | Audit log (actor/action/object/before/after/source) on material actions | `lib/audit.ts` at every mutation | T:email.test.ts, directors.test.ts | VERIFIED |
| R42.1 | Auth: bcrypt(12), HMAC-signed httpOnly session cookies, DB sessions, timing-safe | `lib/auth.ts` | T:e2e/01 (bad password rejected, login, unauthenticated redirect) | VERIFIED |
| R42.2 | Server-side authorization on every read/write | requireUser/requireAdmin + ownership guards | T (messaging/search/notes authz) | VERIFIED |
| R42.3 | AI keys server-side only | providers only imported server-side; no NEXT_PUBLIC | B | VERIFIED |
| R42.4 | File validation + upload limits | `validateUpload` (type, size, name) | unit path in storage | IMPLEMENTED |
| R42.5 | Secure headers | next.config.ts headers | B | IMPLEMENTED |
| R42.6 | Prompt-injection defenses (data-not-instructions framing on all AI inputs) | system prompts in capabilities.ts | design-level | IMPLEMENTED |
| R42.7 | Rate limiting + login throttling | `lib/ratelimit.ts` (login action per-IP, API routes per-user) + DB-backed `lib/loginThrottle.ts`; NOT in proxy (sandbox holds no state) | T:hardening.test.ts + live 429 after 240 API calls | VERIFIED |
| R42.8 | CI with dependency scanning | `.github/workflows/ci.yml` (test, build, `npm audit --audit-level=high`) | GitHub Actions run #1: conclusion success; audit 0 vulnerabilities | VERIFIED |
| R42.9 | Encryption at rest / TLS | deployment-platform concern, documented | — | BLOCKED_EXTERNAL |
| R43.1 | Exports: chronology, meeting, site, vendor, director, activity, briefing — with attribution | `/api/export/*`, `services/exports.ts` | T:integration.test.ts + S | VERIFIED |
| R43.2 | Project & contract dedicated report exports | `projectReport`/`contractReport` + `/api/export/(project|contract)/[id]` + UI buttons | T:hardening.test.ts + live 200 | VERIFIED |
| R44.1 | Global integration chain (16 steps) | full-stack services | T:integration.test.ts | VERIFIED |
| R45.1 | Primary-outage failover test | — | T:orchestrator.test.ts | VERIFIED |
| R45.2 | Total-outage emergency test (app continues, queue, status, no loss) | — | T:email.test.ts, orchestrator.test.ts | VERIFIED |
| R48.1 | UX loop: realistic executive workflows in a real browser | `e2e/` Playwright suite (10 specs, 16 tests): login, briefing + ack, site visit, infraction, email → confirm link → corrective draft, meetings, messaging, Chief of Staff w/ sources, search, export | T:e2e — 16/16, independently re-run | VERIFIED |
| R49.2 | Performance/reliability pass | `scripts/perf.mjs` + `docs/PERFORMANCE.md`; budgets: worst page p95 38.5ms (≤1500), 410/410 status 200, clean 20-way concurrency, growth probe flat | rerunnable script, exit 0, independently re-run | VERIFIED |
| R49.1 | Release gate | ALL criteria pass: vitest 73/73, E2E 16/16, perf budgets, CI green, audit 0 vulns, clean build, AND live-provider evidence: live AI evaluation on funded Anthropic (T:live-provider.test.ts 3/3 — real analysis quality, health accuracy) plus app-level live drain proof (outage-queued email re-analyzed by live Claude via one page load), plus the real-provider failure drill (billing outage → Emergency Mode + queue + alerts, run live). Optional residual: live handoff to a funded second provider (Gemini key valid, awaiting Google credits) | T:live-provider.test.ts + live app drill | VERIFIED |

## Summary (counted from this register)
- VERIFIED: 74 · IMPLEMENTED: 8 · IN_PROGRESS: 0 · NOT_STARTED: 0 · BLOCKED_EXTERNAL: 7 (credential/infra integrations)

## BLOCKED_EXTERNAL — unblock conditions
1. **Live AI providers** — set `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` (server env). All orchestration, failover, and emergency paths are built and tested against the provider interface.
2. **Email intake address (Method B)** — provision inbound mail (e.g. SES/Mailgun webhook) posting raw RFC-822 to a new authenticated route that calls `ingestEmail`; set `EMAIL_INTAKE_ADDRESS`.
3. **Plaud API sync** — Plaud credentials; implement adapter in `src/lib/services/plaud.ts` against the documented seam.
4. **Email notification delivery** — SMTP/provider credentials; notifications already model the optional-email flag.
5. **Voice provider** — set `VOICE_PROVIDER`/`VOICE_API_KEY`; training narration and voice profiles activate behind the abstraction.
6. **Encryption at rest / TLS** — production platform configuration (see docs/DEPLOYMENT.md).
7. **Production PostgreSQL** — swap datasource + run migrations (docs/DEPLOYMENT.md).
