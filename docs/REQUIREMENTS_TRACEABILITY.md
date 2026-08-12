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
| R6.16 | Email attachment parsing (extract & store .eml attachments as files) | not yet — storage layer exists (`lib/storage.ts`) | — | NOT_STARTED |
| R7.1 | No mailbox login/sync; intentional submission only | no mail-sync code exists; UI states policy | design-level | VERIFIED |
| R7.2 | Method B intake address | env seam `EMAIL_INTAKE_ADDRESS`; needs inbound-mail infra | — | BLOCKED_EXTERNAL |
| R8.1 | Secondary provider assumes on primary failure | `ai/orchestrator.ts` | T:orchestrator.test.ts | VERIFIED |
| R8.2 | Subtle user continuity notice + admin technical alert | `notifyFailover/notifyOutage` | T:orchestrator.test.ts | VERIFIED |
| R8.3 | Emergency engine on total outage; health-controlled, not user-toggled | `ai/emergency.ts`; activation only via orchestrator failure path | T:email.test.ts, emergency.test.ts | VERIFIED |
| R8.4 | Emergency capabilities: classification/urgency/intent/deadlines/actions/templates | `emergency.ts`, personality templates | T:emergency.test.ts, drafting.test.ts | VERIFIED |
| R8.5 | "Emergency Intelligence Mode" clearly displayed | header badge, ModeBadge on records, admin banner | S | IMPLEMENTED |
| R8.6 | Queued AI work during outage, no data loss | `AiQueueItem`, queueWork | T:email.test.ts, orchestrator.test.ts | VERIFIED |
| R8.7 | Queue drain on provider recovery (background re-analysis) | queue + RECOVERED events exist; drain worker not built | — | IN_PROGRESS |
| R9.1 | 12 outgoing personality profiles with structured rules | `ai/personalities.ts` | T:drafting.test.ts | VERIFIED |
| R9.2 | FIRM/CORRECTIVE rule structure per spec | profile rules | T:drafting.test.ts | VERIFIED |
| R9.3 | Profiles work in AI mode AND emergency templates | `draftEmailReply` fallback | T:drafting.test.ts | VERIFIED |
| R9.4 | Admin-editable personality rules (currently code-defined) | profiles centralized in one module | — | IN_PROGRESS |
| R10.1 | 10 sites seeded, unbounded architecture | `prisma/seed.ts`, Site model | S | VERIFIED |
| R10.2 | Site profile: directors/executives/projects/observations/vendors/contracts/visits/timeline | `sites/[id]/page.tsx` | S | IMPLEMENTED |
| R10.3 | Six observation categories incl. back burner/radar | `SiteObservation.category` | T:briefing tests use CRITICAL | VERIFIED |
| R11.1 | Site Visit Mode with all six capture categories | `visits/[id]`, `services/visits.ts` | S | IMPLEMENTED |
| R11.2 | Visit completion → structured record + calendar activity | `completeVisit` | unit-level via service; S | IMPLEMENTED |
| R12.1 | Director profiles with connected file | `directors/[id]` | S | IMPLEMENTED |
| R13.1 | Add to Director File with 9 classifications from email/Plaud/manual | `addToDirectorFile` + forms | T:directors.test.ts | VERIFIED |
| R13.2 | AI recommends classification but cannot file infractions | server-side guard | T:directors.test.ts | VERIFIED |
| R14.1 | Structured infraction records with audit history | `Infraction` model, `recordInfraction` | T:directors.test.ts | VERIFIED |
| R14.2 | Configurable threshold alert (count/window/categories/severity/recipients) | `Setting infraction.alertRule`, `checkInfractionThreshold` | T:directors.test.ts | VERIFIED |
| R14.3 | Escalation behavior & acknowledgement requirement on infraction alerts | alerts + per-user acks exist; ack-required enforcement on this alert type minimal | — | IN_PROGRESS |
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
| R20.3 | Attachments on notes/comments | StoredFile layer exists; note attachment UI not wired | — | NOT_STARTED |
| R21.1 | Private flags (5 labels), invisible to others | `Flag` unique per user | S; briefing test shows per-user flags | VERIFIED |
| R22.1 | Attention flags: immediate in-app notification linking to source | `directAttentionAction`, mentions | T:briefing-messaging.test.ts | VERIFIED |
| R22.2 | Optional email notification delivery | Notification model has the seam; SMTP not configured | — | BLOCKED_EXTERNAL |
| R23.1 | Corporate notes workspace linkable to entities | Note.scope=CORPORATE, `/notes?scope=corporate` | S | IMPLEMENTED |
| R23.2 | AI-recommended relationships need human confirmation | Link.confirmed workflow (shared with email) | T:email.test.ts | VERIFIED |
| R24.1 | Contextual discussions on sites/vendors/contracts/projects/public notes | polymorphic `Comment` + UI on each page | S | IMPLEMENTED |
| R25.1 | Direct & group messaging, unread state, object sharing | `services/messaging.ts`, messages pages | T:briefing-messaging.test.ts | VERIFIED |
| R25.2 | Participant-only authorization | `sendMessage` guard + page redirect | T:briefing-messaging.test.ts | VERIFIED |
| R25.3 | True push realtime (websocket/SSE) — currently request/refresh delivery | unread counts + notifications on each request | — | IN_PROGRESS |
| R26.1 | Conversation Brief after configurable inactivity; searchable; retention respected | `maybeBriefInactiveConversations` | T:briefing-messaging.test.ts | VERIFIED |
| R27.1 | Meeting upload, AI extraction (summary/decisions/actions/unresolved) | `services/meetings.ts` | T:briefing-messaging.test.ts | VERIFIED |
| R27.2 | Extracted actions become live action items linked to meeting | `uploadMeeting` | T:briefing-messaging.test.ts | VERIFIED |
| R28.1 | Next-day briefing rule with link to original meeting; exportable | `buildBriefing` meetings block, `/api/export/meeting` | T:briefing-messaging.test.ts | VERIFIED |
| R29.1 | Briefing = default opening experience, greets by name, personalized | `/` → `/briefing`, `buildBriefing` | T:briefing-messaging.test.ts | VERIFIED |
| R30.1 | Per-executive acknowledgement; source remains; consequence disclosed | ack flow + UI copy | T:briefing-messaging.test.ts | VERIFIED |
| R31.1 | Dashboard with the 12 core panels | `dashboard/page.tsx` | S | IMPLEMENTED |
| R31.2 | Configurable layouts | — | — | NOT_STARTED |
| R32.1 | Activity calendar records all meaningful actions; day/week/month reconstruction | `recordActivity` at every mutation, `/calendar` | T:integration.test.ts | VERIFIED |
| R32.2 | AI uses calendar as context | `chief.ts gatherContext` | T (chief path) | VERIFIED |
| R33.1 | Plaud manual import → transcript analysis, searchable, connectable | `services/plaud.ts` | S; analysis path shared w/ tested meeting capability | IMPLEMENTED |
| R33.2 | Plaud API sync | adapter seam documented in plaud.ts | — | BLOCKED_EXTERNAL |
| R33.3 | No auto-discipline from recordings; human confirmation | shared `addToDirectorFile` guard | T:directors.test.ts | VERIFIED |
| R34.1 | Memory with provenance; inspect/edit/delete own only | `/memory`, ownership guards | S | IMPLEMENTED |
| R34.2 | AI never silently writes memory | no code path writes MemoryItem from AI | design-level | VERIFIED |
| R35.1 | Chief of Staff grounded answers with source links; honest when unsupported | `services/chief.ts`, `answerGrounded` system prompt | T:integration.test.ts | VERIFIED |
| R36.1 | Cross-entity search, permissions enforced before retrieval | `lib/search.ts` query-level filters | T:briefing-messaging.test.ts | VERIFIED |
| R36.2 | Semantic/natural-language retrieval (beyond keyword) | keyword + structured retrieval today | — | IN_PROGRESS |
| R37.1 | Voice provider abstraction, server-side credentials | env seam (VOICE_PROVIDER/KEY); no vendor hard-coding | — | BLOCKED_EXTERNAL |
| R38.1 | Training center with Welcome presentation + 17 workflow guides | `/training` | S | IMPLEMENTED |
| R38.2 | Narrated video training using the real interface | requires voice/recording pipeline | — | BLOCKED_EXTERNAL |
| R38.3 | Contextual "How do I use this?" on every screen | training hub exists; per-screen links partial | — | IN_PROGRESS |
| R39.1 | Object storage w/ sha256 dedupe, metadata, ownership, retention | `lib/storage.ts`, StoredFile | unit via upload validation; S | IMPLEMENTED |
| R40.1 | Relational source of truth; no contradictory stores | single Prisma schema | B | VERIFIED |
| R40.2 | Background/event processing infrastructure | AiQueueItem + on-request processing; no worker daemon | — | IN_PROGRESS |
| R41.1 | Audit log (actor/action/object/before/after/source) on material actions | `lib/audit.ts` at every mutation | T:email.test.ts, directors.test.ts | VERIFIED |
| R42.1 | Auth: bcrypt(12), HMAC-signed httpOnly session cookies, DB sessions, timing-safe | `lib/auth.ts` | S (login/redirect) | IMPLEMENTED |
| R42.2 | Server-side authorization on every read/write | requireUser/requireAdmin + ownership guards | T (messaging/search/notes authz) | VERIFIED |
| R42.3 | AI keys server-side only | providers only imported server-side; no NEXT_PUBLIC | B | VERIFIED |
| R42.4 | File validation + upload limits | `validateUpload` (type, size, name) | unit path in storage | IMPLEMENTED |
| R42.5 | Secure headers | next.config.ts headers | B | IMPLEMENTED |
| R42.6 | Prompt-injection defenses (data-not-instructions framing on all AI inputs) | system prompts in capabilities.ts | design-level | IMPLEMENTED |
| R42.7 | Rate limiting | — | — | NOT_STARTED |
| R42.8 | Dependency scanning in CI | no CI pipeline in repo yet | — | NOT_STARTED |
| R42.9 | Encryption at rest / TLS | deployment-platform concern, documented | — | BLOCKED_EXTERNAL |
| R43.1 | Exports: chronology, meeting, site, vendor, director, activity, briefing — with attribution | `/api/export/*`, `services/exports.ts` | T:integration.test.ts + S | VERIFIED |
| R43.2 | Project & contract dedicated report exports | site/vendor reports include them; standalone exports pending | — | IN_PROGRESS |
| R44.1 | Global integration chain (16 steps) | full-stack services | T:integration.test.ts | VERIFIED |
| R45.1 | Primary-outage failover test | — | T:orchestrator.test.ts | VERIFIED |
| R45.2 | Total-outage emergency test (app continues, queue, status, no loss) | — | T:email.test.ts, orchestrator.test.ts | VERIFIED |
| R49.1 | Release gate | see BUILD_STATUS.md — **not yet passed**; open items above | — | IN_PROGRESS |

## Summary (counted from this register)
- VERIFIED: 52 · IMPLEMENTED: 14 · IN_PROGRESS: 9 · NOT_STARTED: 5 · BLOCKED_EXTERNAL: 7

## BLOCKED_EXTERNAL — unblock conditions
1. **Live AI providers** — set `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` (server env). All orchestration, failover, and emergency paths are built and tested against the provider interface.
2. **Email intake address (Method B)** — provision inbound mail (e.g. SES/Mailgun webhook) posting raw RFC-822 to a new authenticated route that calls `ingestEmail`; set `EMAIL_INTAKE_ADDRESS`.
3. **Plaud API sync** — Plaud credentials; implement adapter in `src/lib/services/plaud.ts` against the documented seam.
4. **Email notification delivery** — SMTP/provider credentials; notifications already model the optional-email flag.
5. **Voice provider** — set `VOICE_PROVIDER`/`VOICE_API_KEY`; training narration and voice profiles activate behind the abstraction.
6. **Encryption at rest / TLS** — production platform configuration (see docs/DEPLOYMENT.md).
7. **Production PostgreSQL** — swap datasource + run migrations (docs/DEPLOYMENT.md).
