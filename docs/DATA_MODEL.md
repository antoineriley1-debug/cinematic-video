# Data Model

Authoritative schema: `prisma/schema.prisma` (35 models). SQLite in dev,
PostgreSQL-compatible. Enum-like strings validated in `src/lib/validate.ts`.

## Identity & platform
- **User** (role ADMIN|EXECUTIVE), **Session** (DB-backed, HMAC-signed cookie)
- **Setting** — JSON-valued, admin-configurable business rules (infraction
  alert rule, contract watch window, emergency dictionaries, thresholds,
  upload limits, retention, primary AI provider)
- **AuditLog** — actor/action/entity/before/after/source/requestId
- **ActivityEvent** — the executive activity calendar
- **Notification** — MENTION | ATTENTION | ALERT | MESSAGE | SYSTEM | AI_CONTINUITY
- **Link** — polymorphic connections; `confirmed=false` = AI suggestion
  awaiting human confirmation; unique (fromType, fromId, toType, toId)
- **StoredFile** — content-addressed (sha256) object-storage references

## Operations
- **Site**, **SiteAssignment**, **SiteVisit**, **SiteObservation**
  (category: POSITIVE | IMPROVEMENT | TRAINING | CRITICAL | PROJECT | BACKBURNER;
  doubles as standing site attributes and visit observations via `visitId`)
- **Director**, **DirectorFileEntry** (9 classifications; `aiRecommended`,
  `humanConfirmed`, visibility PRIVATE|SHARED), **Infraction** (category,
  severity, status, correction, follow-up)
- **Vendor**, **VendorSite**, **VendorPerformanceRecord** (9 types)
- **Contract**, **ContractSite** — terms text powers grounded AI Q&A;
  endDate/renewalDate/noticeDeadline drive the watch
- **Project**, **ActionItem** (kind ACTION|DEADLINE|FOLLOW_UP, sourceType/Id
  traceability)

## Knowledge & collaboration
- **Note** (visibility PRIVATE|PUBLIC, scope EXECUTIVE|CORPORATE)
- **Comment** (polymorphic, threaded via parentId), **Flag** (private,
  per-user), **Acknowledgement** (per-user per-item; briefing + contract watch)
- **EmailBatch**, **EmailMessage** (rawSource preserved, sha256 unique,
  analysis fields, analysisMode AI|EMERGENCY), **EmailDraft** (personality, mode)
- **Meeting** (minutes + extraction + briefedAt for the next-day rule)
- **PlaudRecording** (transcript + extraction)
- **MemoryItem** (owner-scoped, provenance, lastUsedAt)
- **Conversation / ConversationParticipant / ChatMessage** (sharedEntityType/Id
  for object sharing) / **ConversationBrief**
- **Alert** (DIRECTOR_PATTERN | VENDOR_PATTERN | INFRACTION_THRESHOLD |
  PROVIDER_* | CONTRACT_WATCH; metadataJson carries evidence refs, never
  private narrative)
- **BriefingRecord** (per user per day, for history/export)
- **ProviderEvent** (FAILOVER | OUTAGE | RECOVERED | HEALTH_FAIL)
- **ChiefThread / ChiefMessage** (sourcesJson = grounding citations)
- **AiQueueItem** — safe queueing during total AI outage

## Invariants
1. `EmailMessage.rawSource` is never mutated after ingest.
2. A `Link` with `confirmed=false` never appears in confirmed-only reads.
3. `DirectorFileEntry` with classification INFRACTION cannot be created with
   `aiRecommended=true` unless `humanConfirmed=true` (service-level guard).
4. `Acknowledgement` rows are strictly (userId, itemType, itemId)-scoped —
   acknowledging never mutates the underlying record.
5. Private notes/memories/flags are filtered by owner in queries, not in UI.
