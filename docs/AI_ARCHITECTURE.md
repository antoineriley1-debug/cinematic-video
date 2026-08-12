# AI Architecture

## Principles
1. **Vendors are replaceable.** Business modules request capabilities
   (`email.analyze`, `email.draft`, `meeting.analyze`, `chief.answer`,
   `conversation.brief`, …) from `src/lib/ai/capabilities.ts`; only the
   orchestrator knows providers exist.
2. **Server-side only.** Provider calls and keys live exclusively in server
   code; nothing AI-related ships to the browser.
3. **Grounded or silent.** The Chief of Staff answers only from retrieved,
   authorized records and cites sources; when records don't support an
   answer it says so.
4. **Honest degradation.** Deterministic output is always labeled
   `mode: "EMERGENCY"` and surfaced as "Emergency Intelligence Mode".

## Components
- `ai/types.ts` — capability/request/response contracts, error types.
- `ai/providers/anthropic.ts`, `openai.ts` — fetch-based adapters with
  timeouts and health probes. `mock.ts` — controllable test double.
- `ai/orchestrator.ts` — provider ordering (admin setting
  `ai.primaryProvider`), per-provider health state, automatic failover with
  user continuity notices + admin alerts, `ProviderEvent` logging
  (FAILOVER/OUTAGE/RECOVERED/HEALTH_FAIL), and `AiQueueItem` queueing so no
  work is lost in a total outage.
- `ai/emergency.ts` — the Deterministic Emergency Intelligence Engine: pure
  functions over admin-configurable keyword dictionaries
  (`emergency.*` settings) plus live entity dictionaries (site/director/
  vendor/contract/project names). Supports classification, urgency, intent,
  date extraction, action detection, and entity suggestion. Activation is
  controlled solely by provider-health logic — there is no user-facing toggle.
- `ai/personalities.ts` — 12 outgoing communication profiles, each with
  structured rules (used to steer AI drafting) and a deterministic template
  (used verbatim in emergency mode).
- `services/chief.ts` — retrieval: permission-enforcing keyword search +
  structured lookups (activity calendar, contract watch, own infractions,
  back-burner items, committed memory) → numbered source blocks → grounded
  answer with citation list persisted per message.

## Prompt-injection posture
Every capability's system prompt frames user-supplied content (emails,
minutes, transcripts, message threads, retrieved records) as **data to
analyze, not instructions to follow**. Retrieval enforces authorization
before the model ever sees a record. Provider responses that fail JSON
validation degrade to the deterministic engine rather than being trusted.

## Failure model (tested)
- Primary down → secondary assumes the request; user gets a subtle
  AI_CONTINUITY notice; admins get a technical alert; FAILOVER event logged.
  (tests/orchestrator.test.ts)
- All providers down → `AllProvidersDownError` → callers serve deterministic
  results, queue AI-quality re-runs, and the app keeps working with accurate
  status. (tests/email.test.ts, tests/drafting.test.ts)
- Recovery → RECOVERED event; queue drain worker is an open item (R8.7).

## Evaluation
`tests/emergency.test.ts` and `tests/drafting.test.ts` act as the
deterministic evaluation suite; provider-quality evals require live keys
(BLOCKED_EXTERNAL) and should assert JSON-schema conformance of
`email.analyze` / `meeting.analyze` outputs per provider.
