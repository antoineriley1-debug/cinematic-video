# Crothall Executive OS — Master Specification

This document is the authoritative requirements source for Crothall Executive
OS, restructured from the founding engineering directive into numbered
requirements. Requirement IDs here are referenced by
`docs/REQUIREMENTS_TRACEABILITY.md`, the codebase, and the test suite.

Governing architecture rule: **EVERYTHING CONNECTS.** No information silos.

## R1 — Platform scope
The system is a connected executive operations and intelligence platform for
Crothall corporate leadership combining: executive intelligence, hospital/site
management, site visits, projects, director profiles/recognition/coaching/
corrective actions/infractions/training, vendor management/performance,
contracts and renewal intelligence, email ingestion/intelligence/chronological
timelines, meeting minutes, Plaud recording ingestion, executive and corporate
notes, calendar/activity history, deadlines and countdowns, executive
messaging, contextual collaboration, files/attachments, notifications, daily
executive briefings, AI Chief of Staff, executive memory, enterprise search,
AI provider orchestration and failover, deterministic emergency intelligence,
administrator controls, auditability, and human-voice training/help.

## R2 — Requirements discipline
- R2.1 Requirements register with IDs; every requirement maps to architecture,
  data model, backend, API, frontend, tests, acceptance criteria, evidence.
- R2.2 Statuses: NOT_STARTED / IN_PROGRESS / BLOCKED / IMPLEMENTED / TESTED /
  VERIFIED; only VERIFIED is done. BLOCKED_EXTERNAL for credential/infra gaps.
- R2.3 Never silently drop, simplify, or fake a requirement.

## R6 — Email module workflow (full chain)
Drag email in → preserve original → parse metadata → parse attachments →
detect duplicate → analyze intent → summary → bullets → actions → dates →
people → identify possible site/director/vendor/contract/project → user
confirms uncertain relationships → store confirmed relationships → calendar
activity → searchable → AI Q&A → personality-based drafting (corrective,
firm, escalation, coaching, and other configured personalities) → Add to
Director File → classify as corrective / explicit infraction → director
timeline update → multi-email upload → chronological ordering → email-event
timeline (date, sender, recipients, subject, content, event, decisions,
commitments, attachments, source email) → exportable for reporting.

## R7 — Email ingestion restriction
No direct mailbox login or sync. Method A: drag-and-drop/paste. Method B:
dedicated intake address only if that infrastructure is configured.

## R8 — Email AI failure mode
Primary provider → secondary assumes capability with subtle user notice and
admin technical alert → all providers down activates the Deterministic
Emergency Intelligence Engine (user cannot activate it manually; provider
health controls it). Emergency mode: deterministic parsing, configurable
keywords, sender/urgency/deadline/corrective/escalation rules, known-entity
dictionaries, templates, personality rules. Reduced-capability classification,
urgency, intent, deadline extraction, action detection, routing, template
responses. Clearly displayed as "Emergency Intelligence Mode"; never
misrepresented as full AI reasoning.

## R9 — Email personality engine
Incoming analysis behavior separated from outgoing writing behavior. Outgoing
profiles (minimum): Standard Executive, Professional, Friendly, Concise, Firm,
Escalated, Corrective, Coaching, Recognition, Request for Action, Follow-Up,
Deadline Driven. Profiles contain structured rules (e.g. FIRM: direct opening,
identify issue/expected action/accountable party, request completion date,
minimal filler, professional, no insults, no threats, clear closing;
CORRECTIVE: documented issue, expected standard, required correction,
completion date, follow-up, factual, no unsupported accusations). Profiles
serve AI mode AND provide templates/rules for Emergency Mode.

## R10 — Site/hospital module
Ten current sites without a ten-site limit. Permanent site profiles: identity,
directors, assigned executives, projects, positive attributes, improvement
opportunities, training needs, critical matters, back-burner/radar, vendors,
contracts, notes, public notes, site visits, documents, emails, meeting
references, Plaud references, actions, deadlines, calendar history, KPI info,
historical timeline.

## R11 — Site Visit Mode
Dedicated mode capturing: positive attributes, improvement opportunities,
training, critical matters, projects, back burner/radar. Supports notes,
attachments, imported Plaud intelligence, email relationships, projects,
people, vendors, contracts. Completion creates a structured visit record and
calendar activity.

## R12 — Director module
Structured profiles: identity, site, performance, recognition, positive
observations, coaching, correctives, infractions, training, projects, actions,
emails committed to file, Plaud-derived records, notes, timeline, attachments.

## R13 — Add to Director File
Reusable action from emails, notes, Plaud records, site observations,
projects, documents, corrective communications. Classifications: Recognition,
General Note, Coaching, Corrective, Infraction, Training, Performance,
Project, Follow-Up. AI can recommend; AI must NOT independently classify a
formal infraction without human confirmation.

## R14 — Infraction engine
Structured records (director, site, date, recorded by, category, severity,
description, evidence, related records, corrective action, expected
correction, follow-up, status, resolution, attachments, audit history).
Default rule: more than three qualifying infractions triggers an executive
alert — NOT hard-coded; admin configures count, window, categories, severity,
recipients, escalation, acknowledgement requirements.

## R15 — Director cross-executive pattern detection
Private notes remain private. When multiple executives independently document
qualifying concerns about the same director, generate a pattern alert showing
only permitted metadata — never the private narrative.

## R16/R17 — Vendor intelligence & performance
Vendor profiles (identity, contacts, sites, contracts, documents, emails,
issues, performance history, notes, public notes, attachments, actions,
deadlines, timeline); filter by site. Performance documentation types:
positive, concern, quality issue, service issue, missed requirement, missed
deadline, contract concern, escalation, resolution. Public vendor notes take
comments/replies/attachments/@mentions. Cross-site recurring problems raise a
Vendor Pattern Alert with supporting authorized evidence.

## R18/R19 — Contracts & 90-day watch
Contracts connect to vendor, sites, project, documents, emails, notes,
discussions, deadlines, renewal info, responsible executives. AI answers
contract questions from contents with source references. Configurable renewal
watch (default 90 days) with countdowns (90/60/30…), surfacing expiration,
renewal, notice deadlines, renegotiation issues, outstanding concerns, related
vendor performance. Acknowledgement is per-executive, explained before
acknowledging, never dismisses for others; the deadline stays on the contract
record and deadline dashboard.

## R20–R23 — Notes, private flags, attention flags, corporate notes
Notes connect to corporate/site/director/vendor/contract/project/meeting/
email/action. Default PRIVATE; author can make PUBLIC (visible to authorized
executives; supports comments, threaded replies, attachments, @mentions).
Private per-executive flags (Follow Up, Important, Review, Ask Later,
Priority) invisible to others. Attention flags (@Name) notify immediately
in-app with optional email, linking to the source object; no SMS. Corporate
Notes workspace for cross-hospital matters, linkable to any entity; AI can
recommend relationships but human confirmation is required before uncertain
relationships become permanent.

## R24–R26 — Collaboration, messaging, conversation intelligence
Collaboration is a reusable platform service: contextual discussions
(comments, replies, threads, @mentions, attachments, decisions, actions,
timestamps, participants, audit) on projects, contracts, vendors, sites,
public notes, meetings. Real-time messaging: direct/group, delivery, unread
state, @mentions, attachments, object/file sharing, in-app + optional email
notifications; supported objects can be sent into a conversation.
Conversation Intelligence: after configurable inactivity, AI creates a
searchable Conversation Brief (purpose, participants, facts, decisions, files,
actions, owners, deadlines, unresolved questions, final status); retention
respects policy — no auto-destruction of corporate records.

## R27/R28 — Meeting minutes & next-day briefing rule
Meeting module: upload notes/minutes; records connect to participants, sites,
directors, vendors, contracts, projects, files, actions, deadlines. AI
extracts summary, decisions, key discussion, actions, owners, deadlines,
unresolved matters, follow-ups. Anything uploaded since the previous briefing
is considered for the next briefing (summary, decisions, actions, deadlines,
reminders, issues, follow-ups) with a link to the original meeting; export
capability.

## R29–R31 — Briefing, acknowledgements, dashboard
Daily Executive Briefing is the default opening experience; greets by name;
personalized per executive (private notes, public notes, meetings, mentions,
attention flags, actions, deadlines, contract countdowns, critical matters,
vendor/director alerts, project issues, follow-ups, newly processed info).
Acknowledgement is per-executive, removes items from that executive's
recurring briefing only, never others'; source records remain; user informed
of the consequence first. Dashboard panels: Today's Priorities, Countdown
Center, Critical Matters, Contract Renewal Watch, My Attention, Director
Intelligence, Vendor Intelligence, Site Health, Projects, Recent Activity,
AI Chief of Staff, Search; configurable layouts.

## R32 — Executive activity calendar
Everything meaningful contributes to an activity timeline (email analyzed/
drafted, note created, site visit, meeting uploaded, project updated,
corrective created, infraction recorded, vendor concern, contract reviewed,
AI investigation, action completed). Executives can reconstruct a day/week/
month; AI uses authorized calendar data as context.

## R33 — Plaud integration
Plaud is the designated recording source; no redundant recording subsystem.
Secure Plaud API configuration where available plus permitted manual import.
Process into transcript, speakers, summary, decisions, actions, commitments,
sites, directors, vendors, projects, contracts, follow-ups. No automatic
conversion of AI interpretation into formal discipline; human confirmation for
sensitive classifications; Plaud data searchable and connectable.

## R34 — Executive memory
COMMIT TO MEMORY: deliberate saves with provenance (source, owner, date,
category, visibility, content, last used, modification history). Users
inspect/edit/delete their own memory. AI guesses never silently become
permanent memory.

## R35 — AI Chief of Staff
Persistent assistant answering operational questions ("What needs my
attention today?", "How many infractions have I documented for Director X?",
"Which contracts are approaching expiration?", "What's on my back burner?").
Answers grounded in authorized records with source links; unsupported AI
claims never presented as organizational facts.

## R36 — Enterprise search
Search across authorized sites, directors, vendors, contracts, projects,
emails, timelines, meetings, Plaud records, notes, public notes, briefs,
files, actions, calendar activity, decisions, deadlines. Natural-language
support. Permissions enforced BEFORE retrieval.

## R37/R38 — Voice & training
Natural voice through a provider abstraction (no single-vendor hard-coding;
credentials server-side; selectable profiles). In-app training center with the
flagship "Welcome to Crothall Executive OS" introduction (helper, not sales),
individual help for major workflows, contextual "How do I use this?" access,
natural professional voice.

## R39/R40 — Files & data architecture
Object storage for large files (Plaud audio, attachments, documents,
contracts, meeting uploads) with content dedupe (same stored object,
references), metadata, checksum, ownership, relationships, retention, audit.
Relational transactional DB as the source of truth; search/index
infrastructure for retrieval; event/background processing for async work; no
contradictory sources of truth.

## R41/R42 — Auditability & security
Audit material actions (actor, timestamp, action, object, before/after state,
source, correlation). Defense in depth: secure auth, server-side authz,
secure sessions, secret management, TLS, at-rest encryption where supported,
file validation, upload limits, rate limiting, input validation, output
encoding, dependency scanning, secure headers, audit logs, AI prompt-injection
defenses, retrieval authorization, server-side AI calls, backup/recovery. The
browser is never the security boundary; API keys never reach end-user devices.

## R43 — Reporting/export
Exportable: email chronology, meeting report, site report, project report,
vendor report, director operational history, contract report, executive
activity report, daily briefing — with source attribution preserved.

## R44/R45 — Global integration & AI failure validation
Full-chain scenario (email → site → vendor → contract → deadline → calendar →
briefing → public note → comment → threshold → alert → Chief of Staff →
search → activity → export) must pass end to end. AI failure tests: primary
outage (secondary assumes, app operational, continuity notice, admin alert,
completion, logging) and total outage (core app continues, Emergency Mode for
supported functions, rules/templates continue, pending AI work queues safely,
accurate status, no data loss).

## R46–R49 — Final audits & release gate
Requirements audit (AUDIT → GAPS → IMPLEMENT → TEST → AUDIT), security loop
(SCAN → REVIEW → ATTACK → FIX → RETEST; critical/high findings block release),
UX loop over realistic executive workflows, and the release gate (all tests,
evaluations, failover/emergency tests, security, migrations, workflows,
traceability, no secrets in source, clean build, deployment/backup/admin/
training documentation) before declaring completion.

## R50–R56 — Process
BUILD_STATUS.md maintained; docs kept synchronized as persistent project
memory; autonomous engineering decisions where the spec establishes intent;
implementation follows the 29-phase dependency order; quality standard:
reliable, connected, fast, clear, professional, auditable, secure, resilient,
easy to use — "Crothall Executive OS is working beside me."
