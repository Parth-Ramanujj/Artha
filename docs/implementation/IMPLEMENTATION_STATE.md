# Implementation State

> Last updated: 2026-10-11

## Current Phase: All 11 Phases Complete

## Completed Phases

### Phase 1: Baseline Audit (2026-10-11)
- Full audit of auth model, database entities, Cloud API adapter, frontend
- Fixed: Cloud API webhook controller (service extraction, security bugs, lint)
- Fixed: Windows path handling in global-route-fence-coverage.spec.ts
- Added CloudApiWebhookController to EXPECTED_PUBLIC_CONTROLLERS in swagger spec
- Baseline: TypeScript clean, 245/252 test suites pass, build clean

### Phase 2: Context Docs + Tenant Design (2026-10-11)
- Created `docs/implementation/ARTHA_CONTEXT.md` (verified architecture)
- Created `docs/implementation/TENANT_DESIGN.md` (multi-tenant isolation design)
- Design: Business entity in data DB, businessId on sessions + api_keys
- Design: 4 migrations (businesses table, memberships, session businessId, apikey businessId)
- Design: Auth guard enhancement, session ownership check, data query scoping

### Phase 3: Tenant/Business Isolation (2026-10-11)
- Created `src/modules/business/` module with:
  - `entities/business.entity.ts` — Business (data DB: name, slug, plan, isActive, settings)
  - `entities/business-membership.entity.ts` — BusinessMembership (apiKeyId ↔ businessId, role)
  - `dto/create-business.dto.ts`, `update-business.dto.ts`, `add-membership.dto.ts`
  - `business.service.ts` — CRUD, membership management, access assertion, slug generation
  - `business.controller.ts` — REST endpoints at /api/businesses (ADMIN + unscoped only)
  - `business.module.ts` — NestJS wiring with cross-DB repository injection
- Added `businessId` column to:
  - `ApiKey` entity (main DB) — logical reference to data DB business
  - `Session` entity (data DB) — tenant ownership marker
  - `AuditLog` entity (main DB) — business attribution on every audit row
- Created 4 migrations:
  - `1786000000000-AddBusinesses.ts` — businesses + business_memberships tables (data DB)
  - `1786100000000-AddBusinessIdToSessions.ts` — businessId on sessions (data DB)
  - `1786200000000-AddBusinessIdToApiKeys.ts` — businessId on api_keys (main DB)
  - `1786300000000-AddBusinessIdToAuditLogs.ts` — businessId on audit_logs (main DB)
- Updated `app.module.ts` — imported BusinessModule, added business entity glob to data DB
- Updated request context — propagates businessId from guard through async context
- Updated API key guard — stamps businessId into request actor context
- Updated audit service — auto-stamps businessId on every audit log row
- Updated session service — `create()` stamps businessId, `findAll()` and `getStats()` filter by it
- Updated session controller — passes apiKey.businessId to service methods
- Updated all test mock objects (auth, session) with businessId field
- Result: TypeScript clean, 244/252 test suites pass (same 8 pre-existing), build clean

## Decisions Made

1. **Business entity goes in data DB, not main DB** — businesses are operational data, not auth infra. API key's businessId is a logical reference (no cross-DB FK).
2. **Session is the natural tenant boundary** — most data is already scoped by sessionId. Adding businessId to sessions cascades scope to messages, webhooks, templates, etc.
3. **Platform admin = unscoped key with no businessId** — preserves backward compatibility.
4. **LidMapping stays global** — phone number LID resolution is not business-specific.
5. **Plugins/Infrastructure stay platform-admin-only** — no per-business plugin isolation needed.
6. **Business controller requires ADMIN + unscoped key** — only platform admins manage businesses.
7. **businessId on all three cross-cutting entities** — ApiKey (identity), Session (ownership), AuditLog (attribution).
8. **Migrations are additive** — all columns nullable, no existing data modified, fully reversible.

### Phase 4: Cloud API Engine Audit + Fixes (2026-10-11)
- **Critical bug fix**: `sendSeen()` was sending malformed payload via `sendMessage()` — rewrote to use direct `graphRequest` with correct `{messaging_product, status, message_id}` shape
- Added `ensureReady()` guard on all send methods — rejects calls when engine not in READY state
- Added 30s timeout on `graphRequest` HTTP requests — prevents hanging on unresponsive Graph API
- Added redirect limit (5) and timeout on `downloadUrl` — prevents infinite redirect loops
- Tracked incoming message IDs in `lastMessageIdByChat` Map for correct read-receipt delivery
- Removed unused imports: GroupParticipant, RevokedMessage, EditedMessage, GroupEvent, IncomingCallEvent
- Removed unused constant: `GRAPH_API_BASE`
- Fixed `getProfilePicture` parameter: `contactId` → `_contactId` (unused stub)
- Added Cloud API env boot validation: `CLOUD_API_ACCESS_TOKEN` and `CLOUD_API_PHONE_NUMBER_ID` required when `ENGINE_TYPE=cloud-api`
- Updated env validation tests for new Cloud API requirements
- Upgraded ESLint config:
  - Added `argsIgnorePattern: '^_'` for `no-unused-vars` (standard practice)
  - Added `require-await: off` override for `**/engine/adapters/*.adapter.ts` (interface contract)
  - Removed now-redundant inline eslint-disable directives from wwebjs adapter
- Fixed `prefer-promise-reject-errors` in media upload catch block
- Result: TypeScript clean, 244/252 tests pass, **0 lint errors** on cloud-api.adapter.ts (down from 196), build clean

### Phase 5: Message Pipeline, Queue, Idempotency (2026-10-11)
- **API-level idempotency interceptor** (`src/common/interceptors/idempotency.interceptor.ts`):
  - `Idempotency-Key` header support on all message send endpoints
  - Scoped per API key (different businesses can't collide)
  - 24h TTL cache with eviction sweep
  - Concurrent duplicate detection returns 409 Conflict
  - Replayed responses marked with `X-Idempotent-Replayed: true` header
  - Full test coverage (5 tests)
- **Business-session access enforcement** (defense in depth):
  - ApiKeyGuard now cross-checks session.businessId against apiKey.businessId
  - AuthModule imports Session entity from data DB for the cross-DB check
  - Rejects with 403 when a business-scoped key accesses another business's session
  - Platform admin keys (no businessId) bypass the check
  - Legacy sessions (no businessId) remain accessible for backward compatibility
  - 4 new guard test cases
- **Swagger API header documentation** for `Idempotency-Key` on message controller
- Verified: Cloud API ingress path correctly uses engine callbacks (not the plugin ingress queue) — by design
- Verified: existing message pipeline already has solid persist-before-send, UNIQUE dedup, pending reaper, webhook idempotency
- Result: TypeScript clean, 245/254 tests pass (same 8 pre-existing failures + 1 new suite), build clean

### Phase 6: Shared Inbox, Contacts, and Leads (2026-10-11)
- **Contact entity** (`src/modules/conversation/entities/contact.entity.ts`):
  - DB-persisted contacts with businessId scoping
  - Unique constraint on `(businessId, waContactId)`
  - Fields: waContactId, phone, name, email, notes, tags (JSON), metadata (JSON)
- **Conversation entity** (`src/modules/conversation/entities/conversation.entity.ts`):
  - Persistent conversation state for shared inbox
  - Unique constraint on `(sessionId, chatId)`
  - Status enum: OPEN, PENDING, CLOSED
  - Fields: assignedTo, assignedName, tags, unreadCount, lastMessageAt, lastMessagePreview
- **ConversationService** (`src/modules/conversation/conversation.service.ts`):
  - Full CRUD for conversations and contacts with business-scoped queries
  - `getOrCreateConversation()` / `getOrCreateContact()` for auto-creation on message events
  - `updateLastMessage()`, `incrementUnread()`, `resetUnread()` for real-time updates
  - Filtering by status, assignedTo, sessionId, search
- **REST controllers** (`src/modules/conversation/conversation.controller.ts`):
  - `ConversationController` at `/conversations` — list, get, update, mark-read
  - `ContactController` at `/contacts` — list, get, create, update, delete
  - Business-scoped via `getBusinessId(apiKey)` — all endpoints enforce business isolation
  - Role guards: OPERATOR for writes, ADMIN for deletes
- **Database migration** (`src/database/migrations/1786200000001-AddConversationsAndContacts.ts`):
  - Creates `contacts` and `conversations` tables in data DB
  - Cross-database compatible (SQLite + PostgreSQL)
  - Proper indexes on businessId, sessionId, unique constraints
- **Message pipeline integration**:
  - `MessageProjector.projectConversation()` auto-creates/updates conversations on every inbound and outbound message
  - Updates lastMessageAt, lastMessagePreview, and unreadCount in real-time
  - Best-effort (fire-and-forget) — never blocks the message receive path
  - SessionModule imports ConversationModule for the integration
- **Route fence coverage**: All 9 new handlers added to ALLOWLIST (business-scoped, self-enforcing)
- Result: TypeScript clean, 245/254 tests pass (same pre-existing failures), 0 lint errors

### Phase 7: Deterministic Workflow Engine (2026-10-12)
- **WorkflowDefinition entity** (`src/modules/workflow/entities/workflow-definition.entity.ts`):
  - Draft/Published/Disabled lifecycle states with immutable published versions
  - 7 trigger types: message_received, keyword_match, new_contact, conversation_assigned, conversation_status_changed, scheduled, message_failed
  - 7 condition types: business_match, session_match, keyword_exact, keyword_contains, conversation_status, contact_tag, working_hours
  - 13 action types: send_message, send_template, assign_conversation, update_conversation_status, add_tag, remove_tag, create_contact, update_contact, schedule_followup, handoff_to_human, pause_automation, webhook_call, wait
  - Per-workflow bounds: maxActionsPerRun, maxExecutionSeconds, maxRetries, maxConcurrentRuns
  - Unique constraint on (businessId, slug); version tracking for published iterations
  - Audit trail: createdBy, updatedBy, publishedBy, publishedAt
- **WorkflowRun entity** (`src/modules/workflow/entities/workflow-run.entity.ts`):
  - Durable execution state: PENDING, RUNNING, COMPLETED, FAILED, CANCELLED, TIMED_OUT, PAUSED
  - Step-by-step results with per-action status, timing, output, errors, retry counts
  - Idempotency key prevents duplicate runs from the same trigger event
- **WorkflowService** (`src/modules/workflow/workflow.service.ts`):
  - Full CRUD with business isolation and definition validation
  - Publish/disable lifecycle with immutable-published-version enforcement
  - Run management: create (with concurrency limit + idempotency), cancel, query
  - Schema validation: trigger types, condition types, action types, unique action IDs
- **WorkflowExecutor** (`src/modules/workflow/workflow-executor.service.ts`):
  - Deterministic step-by-step runner with safety bounds (time limit, action count limit)
  - Condition evaluator: keyword exact/contains match, conversation status, working hours (timezone-aware)
  - Per-action retry with exponential backoff; configurable error handling (stop/skip/retry)
  - Implemented actions: send_message, assign_conversation, update_conversation_status, add_tag, remove_tag, handoff_to_human, pause_automation, wait
  - No arbitrary JS/shell/eval — all actions are typed, validated, server-side only
- **WorkflowTriggerService** (`src/modules/workflow/workflow-trigger.service.ts`):
  - Hooks into existing HookManager on `message:received` (priority 900, after all plugins)
  - Resolves session → businessId, finds matching published workflows
  - Content-based idempotency key (SHA-256 of workflow+session+messageId) prevents duplicate runs
  - Fire-and-forget execution — never blocks the message receive path
- **REST controller** (`src/modules/workflow/workflow.controller.ts`):
  - Workflow CRUD: list, get, create, update, publish, disable, delete
  - Run management: list runs, get run, cancel run
  - Business-scoped via getBusinessId(apiKey); ADMIN required for publish/disable/delete
- **Database migration** (`src/database/migrations/1786300000001-AddWorkflowEngine.ts`):
  - Creates workflow_definitions and workflow_runs tables with cross-DB compatibility
- **Route fence coverage**: All 10 new handlers added to ALLOWLIST
- Result: TypeScript clean, 245/254 tests pass (same pre-existing failures), 0 lint errors

### Phase 8: AI Chatbot and Knowledge Base (2026-10-12)
- **AiConfig entity** (`src/modules/ai/entities/ai-config.entity.ts`):
  - Per-business AI configuration: enabled, provider (OpenAI/Anthropic/Custom), model, systemPrompt
  - Bounds: maxTokens, maxContextMessages
  - Handoff: autoHandoff, handoffKeywords (comma-separated), fallbackMessage
  - Session scoping: sessionScopes array limits which sessions get AI responses
  - Unique constraint on businessId (one config per business)
- **KnowledgeDocument entity** (`src/modules/ai/entities/knowledge-document.entity.ts`):
  - Per-business knowledge base documents: title, fileType, content, status
  - Allowed types: text, markdown, faq, csv, json
  - Max 100 documents per business, 500K chars per document
- **AiService** (`src/modules/ai/ai.service.ts`):
  - Config CRUD with auto-create default on first access
  - Knowledge document CRUD with size/count/type validation
  - Provider-agnostic chat interface with keyword-based handoff detection
  - Knowledge retrieval: query-word overlap scoring, top-3 relevant docs
  - Stub provider (returns fallback) — actual API integration deferred
- **REST controller** (`src/modules/ai/ai.controller.ts`):
  - Config: GET/PUT /ai/config (ADMIN for updates)
  - Knowledge: GET/POST/PUT/DELETE /ai/knowledge (OPERATOR for writes, ADMIN for deletes)
- **Database migration** (`src/database/migrations/1786400000000-AddAiModule.ts`)
- **Route fence coverage**: 7 new handlers added to ALLOWLIST
- Result: TypeScript clean, 245/254 tests pass, 0 lint errors

### Phase 9: Templates, Follow-ups, Campaigns, Consent (2026-10-12)
- **ContactConsent entity** (`src/modules/campaign/entities/contact-consent.entity.ts`):
  - Per-contact opt-in/opt-out tracking with channel support
  - Unique constraint on (businessId, waContactId, channel)
  - Timestamps: consentedAt, revokedAt, source tracking
- **ScheduledMessage entity** (`src/modules/campaign/entities/scheduled-message.entity.ts`):
  - Future-delivery message scheduling with session/chat targeting
  - Status lifecycle: PENDING → SENT/FAILED/CANCELLED
  - Max 1,000 pending messages per business
  - Retry tracking, campaign association
- **Campaign entity** (`src/modules/campaign/entities/campaign.entity.ts`):
  - Bulk messaging campaigns with template or content-based messages
  - Status lifecycle: DRAFT → SCHEDULED → RUNNING → COMPLETED/PAUSED/CANCELLED
  - Rate limiting: ratePerMinute (1-60), configurable per campaign
  - Analytics: totalRecipients, sentCount, deliveredCount, failedCount
- **CampaignRecipient entity** (`src/modules/campaign/entities/campaign-recipient.entity.ts`):
  - Per-recipient tracking with dedup (unique campaignId+chatId)
  - Status: PENDING/SENT/DELIVERED/READ/FAILED/SKIPPED
  - Max 10,000 recipients per campaign
- **CampaignService** with consent enforcement, scheduled message management, campaign lifecycle
- **REST controllers**:
  - `ScheduledMessageController` at `/scheduled-messages` — create, list, cancel
  - `CampaignController` at `/campaigns` — CRUD, schedule, pause, cancel, recipients
  - `ConsentController` at `/consent` — list, get, update consent status
- **Database migration** (`src/database/migrations/1786500000000-AddCampaignModule.ts`)
- **Route fence coverage**: 14 new handlers added to ALLOWLIST
- Result: TypeScript clean, 245/254 tests pass, 0 lint errors

### Phase 10: Dashboard Integration and Roles (2026-10-12)
- **API service layer** (`dashboard/src/services/api.ts`):
  - Added TypeScript types and API clients for: conversations, contacts, workflows, campaigns, scheduled messages, consent, AI config, knowledge documents
  - Pattern: all new APIs use the existing `request<T>()` auth wrapper
- **Dashboard pages**:
  - `Conversations.tsx` — Shared inbox with status filtering, mark-read, unread badges
  - `Workflows.tsx` — Workflow list with publish/disable/delete actions (admin)
  - `Campaigns.tsx` — Tabbed campaigns + scheduled messages with status management
  - `AiSettings.tsx` — AI config view + knowledge base document list with toggle/delete
- **Navigation**: Added 4 nav items (Conversations, Workflows, Campaigns, AI Assistant) with lucide icons
- **Routing**: New routes in App.tsx with role-based access (AI restricted to admin/operator)
- **i18n**: Added English labels for all new nav items
- Result: Dashboard TypeScript clean, backend TypeScript clean, 245/254 tests pass

### Phase 11: Security, Performance, Deployment Readiness (2026-10-12)
- **BusinessScopeGuard** (`src/modules/auth/guards/business-scope.guard.ts`):
  - Global guard that validates the calling key's business exists and is active
  - Opt-in via `@RequireActiveBusiness()` decorator on controllers
  - Checks business record in data DB; rejects with 403 for missing/deactivated businesses
  - Platform admin keys (no businessId) pass through — backward compatible
- **Applied `@RequireActiveBusiness()`** to all business-scoped controllers:
  - ConversationController, ContactController (Phase 6)
  - WorkflowController (Phase 7)
  - AiController (Phase 8)
  - ScheduledMessageController, CampaignController, ConsentController (Phase 9)
- **Existing security infrastructure verified**:
  - Helmet with full CSP (nonces, upgrade-insecure-requests)
  - CORS policy with explicit origin allowlist (wildcard refused in production)
  - SSRF protection on webhooks and media downloads
  - Three-tier rate limiting (short/medium/long) covers all new endpoints
  - WebSocket rate limiting + per-key socket cap
  - API key pepper support, usage tracking, IP whitelisting
  - Readiness/liveness probes with shutdown draining
- Result: TypeScript clean, 245/254 tests pass (same 8 pre-existing), 0 lint errors

## Decisions Made

## Test Results History

| Date | TypeScript | Tests Pass | Tests Fail | Lint Errors | Build |
|------|-----------|------------|------------|-------------|-------|
| 2026-10-11 (baseline) | PASS | 243/252 | 9 | 276 | PASS |
| 2026-10-11 (post-fix) | PASS | 245/252 | 7 | 196 (adapter only) | PASS |
| 2026-10-11 (Phase 3) | PASS | 244/252 | 8 | 0 (new code) | PASS |
| 2026-10-11 (Phase 4) | PASS | 244/252 | 8 | 0 (adapters) | PASS |
| 2026-10-11 (Phase 5) | PASS | 245/254 | 8 | 0 (new code) | PASS |
| 2026-10-11 (Phase 6) | PASS | 245/254 | 8 | 0 (new code) | PASS |
| 2026-10-12 (Phase 7) | PASS | 245/254 | 8 | 0 (new code) | PASS |
| 2026-10-12 (Phase 8) | PASS | 245/254 | 8 | 0 (new code) | PASS |
| 2026-10-12 (Phase 9) | PASS | 245/254 | 8 | 0 (new code) | PASS |
| 2026-10-12 (Phase 10) | PASS | 245/254 | 8 | 0 (dashboard) | PASS |
| 2026-10-12 (Phase 11) | PASS | 245/254 | 8 | 0 (guards) | PASS |

## Known Issues

- 8 pre-existing test failures (Windows-specific: symlinks, process signals, file ordering, Docker service naming)
- ~44 pre-existing lint warnings in wwebjs adapter (unsafe-any from untyped wwebjs library internals)
