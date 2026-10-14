# Artha — Verified Architecture Context

> Last verified: 2026-10-11, commit 66626c6 + uncommitted Cloud API WIP

## Identity

- **Package:** `openwa` v0.12.3
- **Brand:** Artha (formerly OpenWA)
- **Runtime:** Node.js >=22.13 (tested on v24.15.0)
- **Backend:** NestJS 11, TypeScript 6
- **Frontend:** React 19, Vite 8, React Router 7, TanStack Query, Socket.IO, i18next (12 locales)
- **ORM:** TypeORM with dual-database design
- **Ports:** API=2785, Dashboard dev=2886, Swagger=/api/docs

---

## Dual-Database Architecture

### Main DB (always SQLite at `./data/main.sqlite`)
- 2 entities: `ApiKey`, `AuditLog`
- 1 migration file in `src/database/migrations-main/`
- Uses `synchronize: true` by default; optional migration mode

### Data DB (SQLite or PostgreSQL, configurable)
- 13 entities: Session, Message, MessageBatch, Webhook, WebhookDeliveryFailure, Template, BaileysStoredMessage, LidMapping, PluginInstance, ConversationMapping, IngressEvent, IntegrationDeliveryFailure, StatusUpdate
- 24 migration files in `src/database/migrations/`
- Only 3 FK constraints exist (webhooks, templates, baileys_stored_messages → sessions)
- All other `sessionId` columns are bare strings (intentional: data outlives sessions)

---

## Auth Model

- **Identity = API key** (no user accounts, no OAuth, no passwords)
- Key format: `owa_k1_<32 hex bytes>`, SHA-256 hashed (or HMAC with pepper)
- 3 roles: ADMIN > OPERATOR > VIEWER (numeric hierarchy)
- Per-key `allowedSessions` array = de facto tenant boundary
- Per-key `allowedIps` array with fail-closed behavior
- Bootstrap: first boot creates admin key in `data/.api-key`

### Guard Pipeline (per request)
1. `requestContextMiddleware` — request ID + AsyncLocalStorage
2. `ProxyAwareThrottlerGuard` — IP-based rate limiting
3. `ApiKeyGuard` — key validation, role check, session scope, IP whitelist

### Session Scope Enforcement (3 layers)
1. **Guard route-param fence** — extracts `:sessionId` or `:id` on `@SessionScoped()` controllers
2. **`@RequireUnscopedKey()`** — rejects scoped keys on deployment-global routes
3. **Service-level re-scoping** — `resolveSessionScope()` for query-param sessionId

### Structural Test Guards
- `global-route-fence-coverage.spec.ts` — catches unfenced global routes
- `query-session-scope-coverage.spec.ts` — catches missing `@CurrentApiKey()` on query-param routes
- `role-coverage.spec.ts` — asserts role requirements

### WebSocket Auth
- Socket.IO `/events` namespace, key in `auth.apiKey` or `X-API-Key` header
- Per-subscribe re-validation (catches revoked keys mid-session)
- Session scope enforced per subscription; scoped keys cannot subscribe to `*`
- Per-key socket cap, per-frame rate limiting, immediate eviction on key revoke

---

## Engine Architecture

### IWhatsAppEngine Interface (~60 methods)
Location: `src/engine/interfaces/whatsapp-engine.interface.ts`

### Three Adapters
1. **whatsapp-web-js** (~157KB) — headless Chromium, lower ban risk, ~300-500MB/session
2. **baileys** (~109KB) — pure WebSocket, higher ban risk, ~30-80MB/session
3. **cloud-api** (~35KB, WIP) — Meta Graph API v21.0, stateless HTTP

### Engine Registration
- Engines register as built-in plugins via `EngineFactory` → `PluginLoaderService`
- `EngineRegistry` (singleton) tracks live engine instances by session ID
- ESLint rule: controllers MUST NOT import EngineRegistry directly

### Identity System
- All JIDs normalized to neutral dialect (`<phone>@c.us`, `<id>@g.us`, `<lid>@lid`)
- `LidMapping` table for privacy-ID resolution, cross-session by design

---

## Cloud API Status (WIP, uncommitted)

### What exists:
- `CloudApiAdapter` with 21/73 methods implemented
- `CloudApiWebhookService` + Controller for Meta webhook handling
- `CloudApiPlugin` engine wrapper
- Configuration in `src/config/configuration.ts`
- Dashboard config section in Infrastructure page

### Fixed in this phase:
- Controller no longer imports EngineRegistry directly (uses service)
- `timingSafeEqual` length-mismatch crash guard added
- Invalid signature now returns 403 (was 200)
- Webhook dispatch routes by `phone_number_id` (was broadcast to all adapters)

### Known issues (deferred to Phase 4):
- 196 lint errors (unsafe `any` types, unused imports)
- `sendSeen` sends invalid message instead of read-receipt
- No env validation for Cloud API vars at startup
- Unauthenticated webhook when `APP_SECRET` unset (no warning)
- Media download: no redirect depth limit, no size cap
- Missing: editMessage, sendPollMessage, template management, business profile
- No token refresh/rotation mechanism

---

## Module Inventory (30 feature modules)

### Always loaded
SessionModule, MessageModule, TemplateModule, WebhookModule, AuthModule, AuditModule, EventsModule, ContactModule, GroupModule, ProfileModule, CallModule, LabelModule, ChannelModule, StatsModule, MetricsModule, StatusModule, StatusStoreModule, CatalogModule, PluginsApiModule, IntegrationModule, CloudApiWebhookModule, InfraModule, SettingsModule, HealthModule

### Conditionally loaded
QueueModule (QUEUE_ENABLED), SearchModule (SEARCH_ENABLED), McpModule (MCP_ENABLED), ServeStaticModule (production only)

---

## Multi-Tenancy: Current State

**There is NO tenant/business/organization concept.** Zero `businessId`/`tenantId`/`organizationId` columns exist anywhere.

De facto tenant boundary: `ApiKey.allowedSessions` — a comma-separated list scoping which sessions a key can access. This is per-key, not per-business.

### Key gaps:
- No way to group sessions into a business
- Unscoped keys (ADMIN) see all data across all sessions
- Session creation requires unscoped key (`@RequireUnscopedKey()`)
- Audit logs scoped per-session not per-business
- Plugin activation is global/per-session not per-business
- WebSocket rooms are per-session not per-business
- `LidMapping` is intentionally cross-session (multi-tenant breaks this)
- FTS indexes have no tenant awareness
- No row-level security / global query scopes

---

## Test Baseline (2026-10-11)

| Check | Result |
|-------|--------|
| TypeScript (`tsc --noEmit`) | PASS |
| Unit tests | 245 pass, 7 fail (Windows-specific), 1 skip |
| Lint (eslint) | 196 errors (all in cloud-api.adapter.ts — `any` types) |
| Build (`nest build`) | PASS |

Pre-existing test failures (not regressions):
- `wwebjs-backport-201832.spec.ts` — Windows symlink EPERM (3 tests)
- `whatsapp-web-js.adapter.spec.ts` — Windows process sweep (3 tests)
- `plugins.service.spec.ts` — Windows symlink (1 test)
- `infra.controller.spec.ts` — Stream/import handling (3 tests)
- `status-store.service.spec.ts` — File listing behavior (3 tests)
- `storage.service.spec.ts` — File ordering (1 test)
- `feature-flags.spec.ts` — Docker service naming after rebrand (2 tests)

---

## Frontend Architecture

- **Auth:** API key in sessionStorage, validated on mount via `/auth/validate`
- **Roles:** admin/operator/viewer via `useRole` hook + context
- **Route gating:** ApiKeys, Infrastructure, Plugins → admin only (conditional render)
- **API service:** Single `dashboard/src/services/api.ts` (~48KB), `request<T>()` wrapper
- **WebSocket:** Socket.IO with reconnection, per-session subscriptions
- **i18n:** 12 languages, flat namespace with dot-separated keys
- **Zero tenant concept:** No business selector, no tenant context, no scoped queries

---

## Important Design Decisions

1. Dual-database: main (always SQLite) + data (pluggable)
2. Engine-as-plugin: engines register through plugin system
3. Neutral JID dialect: all engines normalize identity output
4. Conditional module loading: optional services load on config
5. Three-layer env precedence: process > .env > data/.env.generated
6. Fail-closed auth: unknown IPs, missing sessions → reject
7. Structural test guards: catch auth regressions at compile time
8. Last-admin protection: serialized check prevents stripping all admin keys
