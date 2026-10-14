# Artha (OpenWA) - Full Project Handoff Prompt

You are continuing development on **Artha** (package name `openwa`), a self-hosted WhatsApp API Gateway. Below is everything you need to know to work on this project.

---

## What is Artha?

Artha is a free, open-source **WhatsApp HTTP API Gateway**. It lets developers send/receive WhatsApp messages, manage multiple WhatsApp sessions, and get real-time events via webhooks and WebSockets. It connects to WhatsApp through three "engines" (reverse-engineered clients + official API).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22 LTS |
| Backend | NestJS 11, TypeScript 6 |
| WA Engines | whatsapp-web.js (headless Chromium), Baileys (WebSocket), Cloud API (Meta official) |
| Database | SQLite (better-sqlite3) or PostgreSQL, via TypeORM |
| Cache | In-memory or Redis (ioredis) |
| Queue | BullMQ (optional, needs Redis) |
| Storage | Local filesystem or S3/MinIO |
| Frontend | React 19, Vite 8, React Router 7, TanStack Query/Table, Recharts, Socket.IO, i18next (12 languages) |
| Container | Docker multi-stage, multi-arch (amd64/arm64) |
| API Docs | Swagger (@nestjs/swagger) |
| MCP | @modelcontextprotocol/sdk (optional Streamable-HTTP server) |

---

## Project Structure

```
.claude/              - Claude Code settings
dashboard/            - React SPA frontend
  src/
    pages/            - Login, Dashboard, Sessions, Chats, Webhooks, Templates, Logs,
                        ApiKeys, MessageTester, Infrastructure, Plugins
    components/       - Layout, Modal, Toast, FilterBuilder, DashboardCharts, etc.
    hooks/            - React Query hooks, WebSocket, role, theme, chat scroll
    services/api.ts   - Single API service file (~48KB, all backend endpoints)
    i18n/locales/     - 12 languages (en, ar, de, es, fr, he, it, ko, pt-BR, te, zh-CN, zh-HK)
    utils/            - ~30 utility modules
docs/                 - 31 detailed markdown docs (architecture, security, API spec, etc.)
scripts/              - Backup/restore, postinstall patches, smoke tests, OpenAPI export
sdk/                  - SDK examples in Go, Java, JavaScript, PHP, Python
src/
  main.ts             - Bootstrap (NestFactory, helmet, CORS, Swagger, CSP nonces, graceful shutdown)
  app.module.ts       - Root NestJS module
  config/             - Env loading, validation, feature flags, security bootstrap
  common/             - Cache, storage, security (SSRF guard, throttler, session scope),
                        logger, shutdown, media, middleware, metrics, transformers
  core/
    hooks/            - Plugin hook system (20 hook events)
    plugins/          - Plugin loader, manifest, sandbox, storage, capabilities
    agent-tools/      - MCP tool registry
  engine/             - WhatsApp engine abstraction layer
    interfaces/       - IWhatsAppEngine (~775-line interface, ~60 methods)
    adapters/         - whatsapp-web-js.adapter (~157KB), baileys.adapter (~109KB),
                        cloud-api.adapter (~35KB)
    identity/         - LID-to-phone mapping (privacy id resolution)
    engine.factory.ts - Creates engines from plugin registry
    engine-capability-matrix.ts - Per-method support status across all 3 engines
  modules/            - ~30 feature modules (see list below)
  plugins/engines/    - Built-in engine plugin wrappers
  database/           - TypeORM data sources, migrations (two dirs: data + main)
test/                 - E2E tests (~20 spec files)
Dockerfile            - Multi-stage (builder + production), multi-arch
docker-compose.yml    - Production compose with profiles
docker-compose.dev.yml - Dev compose (SQLite, local)
openapi.json          - Exported OpenAPI spec (~230KB)
```

---

## Architecture

### Dual-Database Design

Two separate TypeORM connections:
1. **`main` connection** (always SQLite at `./data/main.sqlite`): API keys + audit logs. Never changes type.
2. **`data` connection** (pluggable: SQLite or PostgreSQL): All operational data (sessions, messages, webhooks, templates, integrations, status-store, LID mappings).

Each has its own migration directory (`src/database/migrations/` for data, `src/database/migrations-main/` for main).

### Engine / Adapter Pattern

Core interface: `IWhatsAppEngine` at `src/engine/interfaces/whatsapp-engine.interface.ts` — ~60 methods covering:
- Lifecycle: initialize, disconnect, logout, destroy
- Status/QR: getStatus, getQRCode, requestPairingCode
- Messaging: text, image, video, audio, document, location, contact, sticker, poll
- Reply/Forward, Reactions, Edit, Delete
- Contacts, Groups (full CRUD), Chats, Labels, Channels, Status/Stories, Catalog
- Profile, Calls

Three adapters implement it:
- **whatsapp-web-js** (~157KB): Headless Chromium via whatsapp-web.js. Lower ban risk, high RAM (~300-500MB/session).
- **baileys** (~109KB): Pure WebSocket, no browser. Higher ban risk, low RAM (~30-80MB/session).
- **cloud-api** (~35KB): Official WhatsApp Cloud API via Meta Graph API. **WIP — see below.**

Engines register as **built-in plugins** through `EngineFactory` which uses `PluginLoaderService`.

The `ENGINE_CAPABILITY_MATRIX` documents per-method support across all engines with evidence citations, enforced by `engine-parity.spec.ts`.

**Identity system**: All JIDs are normalized to neutral dialect (`<phone>@c.us`, `<id>@g.us`, `<lid>@lid`). LID-to-phone mappings cached in DB + memory.

### NestJS Modules (~30 total)

**Core infrastructure:**
- ConfigModule, two TypeOrmModules, ThrottlerModule (3 tiers), LoggerModule, CacheModule, StorageModule
- HooksModule (20 hook events), PluginsModule, AgentToolsModule

**Feature modules:**
- **SessionModule** — Session lifecycle, reconnection, liveness watchdog, message projector
- **MessageModule** — Send/receive, bulk messaging, pending message reaper
- **TemplateModule** — Message templates
- **WebhookModule** — Webhook management with smart filters, delivery failures, HMAC signing
- **AuthModule** — API key CRUD, RBAC (admin/operator/viewer), session scoping, IP whitelisting
- **AuditModule** — Audit logging with configurable retention
- **EventsModule** — WebSocket (Socket.IO) real-time events
- **ContactModule**, **GroupModule**, **ProfileModule**, **CallModule**
- **LabelModule**, **ChannelModule** — WhatsApp Business features
- **StatsModule** — Dashboard statistics
- **MetricsModule** — Prometheus `/api/metrics`
- **StatusModule**, **StatusStoreModule** — WhatsApp Stories with 24h TTL purge
- **CatalogModule** — WhatsApp Business product catalog
- **PluginsApiModule** — Plugin management REST API
- **IntegrationModule** — Integration Fabric (provider webhook ingress, signature verification, dedup, DLQ)
- **CloudApiWebhookModule** — Cloud API webhook receiver (new, see WIP below)
- **SearchModule** — Full-text search (Postgres tsvector/GIN, SQLite FTS5)
- **InfraModule** — Infrastructure management (engine selection, DB/Redis/storage config, Docker orchestration)
- **SettingsModule**, **HealthModule**

**Conditionally loaded:** QueueModule (BullMQ), SearchModule, McpModule, ServeStaticModule

### Security

- API Key Auth with SHA-256 hashing, optional HMAC pepper, 3 roles (ADMIN/OPERATOR/VIEWER), per-key session scoping and IP whitelisting
- Three-tier rate limiting (short/medium/long), WebSocket frame limiting, MCP rate limiting
- SSRF protection blocking internal/reserved addresses on webhooks and media
- CSP nonces, constant-time comparison, inflight body budget (DoS hardening)
- Docker: non-root execution (dumb-init → gosu), read-only rootfs, no-new-privileges

### Plugin System

- Plugin loader with lifecycle management, sandboxing, restore-on-boot
- Per-plugin persistent storage with size caps
- Typed capability surface (conversation send facade, handover gate)
- Plugin manifest schema with ingress routes and signature verification
- 20 hook events across session, message, webhook, and ingress lifecycles

---

## Dashboard (Frontend)

React 19 + Vite 8 + TanStack Query + Recharts + Socket.IO + i18next (12 languages)

**Pages:**
- Login (API key auth), Dashboard (stats + charts), Sessions (lifecycle, QR, pairing code), Chats (full chat UI ~97KB), Webhooks (CRUD + filter builder), Templates, ApiKeys (admin), Logs (audit), MessageTester, Infrastructure (engine/DB/Redis/storage config, admin ~58KB), Plugins (admin ~54KB)

**Real-time:** WebSocket via Socket.IO for live session status, messages, events.

**Role-based:** useRole hook with admin/operator/viewer. Admin-only: ApiKeys, Infrastructure, Plugins.

---

## Configuration

Three-layer env precedence: `process env > .env > data/.env.generated` (dashboard writes to the generated file).

Key env vars:
- **Core:** PORT=2785, LOG_LEVEL, AUTO_START_SESSIONS, MAX_CONCURRENT_SESSIONS, DOMAIN, CORS
- **Engine:** ENGINE_TYPE (whatsapp-web.js/baileys/cloud-api), Puppeteer args, Baileys auth dir, Cloud API credentials (CLOUD_API_ACCESS_TOKEN, CLOUD_API_PHONE_NUMBER_ID, CLOUD_API_WABA_ID, CLOUD_API_VERIFY_TOKEN, CLOUD_API_APP_SECRET, CLOUD_API_GRAPH_VERSION)
- **Database:** DATABASE_TYPE (sqlite/postgres), POSTGRES_BUILTIN, connection params
- **Redis/Queue:** REDIS_ENABLED, QUEUE_ENABLED, CACHE_ENABLED
- **Storage:** STORAGE_TYPE (local/s3), MINIO_BUILTIN, S3 credentials
- **Security:** API_MASTER_KEY, API_KEY_PEPPER, TRUSTED_PROXIES
- **Optional:** MCP_ENABLED, SEARCH_ENABLED, METRICS_TOKEN, AUDIT_RETENTION_DAYS

---

## Database Entities

**Main DB (SQLite):** ApiKey (id, name, keyHash, role, allowedIps, allowedSessions, expiresAt), Audit logs

**Data DB (SQLite/Postgres):** Session (id, name, status[8 states], phone, config, proxyUrl), Message (sessionId, waMessageId, chatId, body, type, direction, status), Webhook (sessionId, url, events, filters, secret), WebhookDeliveryFailure, MessageBatch, BaileysStoredMessage, LidMapping, IntegrationInstance, IngressEvent, StatusStore entities

---

## Dev Commands

```bash
npm run dev          # Runs API (NestJS watch) + Dashboard (Vite) concurrently
npm run build:all    # Build NestJS + Dashboard
npm run start:prod   # node dist/main
npm test             # Jest unit tests
npm run test:e2e     # E2E tests
npm run lint         # ESLint
npm run format       # Prettier
```

**Ports:** API + Dashboard (prod) = 2785, Dashboard (dev) = 2886, Swagger = /api/docs

---

## Recent Git History (Key Milestones)

1. **Rebrand from OpenWA to Artha** — UI and documentation rename
2. **Deployment fixes** — Dockerfile HEALTHCHECK port, Railway host binding (0.0.0.0)
3. **v0.12.3** — Engine fixes (link-preview), config fixes (env precedence), dashboard fixes (readiness polling)
4. **v0.12.2** — Plugin fixes (package dir, scope binding), auth fixes (bootstrap key file)
5. **Ongoing refactoring** — Extracted: MessageProjector, plugin capability surface, conversation-tab filters, session form rules, Chromium profile hygiene, API-key usage stats
6. **Cloud API engine** — WIP, see below

---

## Work In Progress (Uncommitted Changes)

The Cloud API engine (third engine, using Meta's official WhatsApp Cloud API) has been partially implemented. Here's what exists:

### New Files (untracked):
1. **`src/engine/adapters/cloud-api.adapter.ts`** (~35KB) — The Cloud API engine adapter implementing `IWhatsAppEngine`. Sends messages via Meta Graph API HTTP calls. Receives incoming messages via webhook payload dispatch.

2. **`src/modules/cloud-api-webhook/cloud-api-webhook.controller.ts`** — NestJS controller at `GET/POST /cloud-api/webhook`:
   - GET: Meta webhook verification (challenge-response with verify token)
   - POST: Receives incoming messages/statuses from Meta, validates HMAC-SHA256 signature, dispatches to all CloudApiAdapter instances via `dispatchWebhookPayload()`

3. **`src/modules/cloud-api-webhook/cloud-api-webhook.module.ts`** — Module wrapping the webhook controller

4. **`src/plugins/engines/cloud-api/index.ts`** — Built-in engine plugin wrapper (same pattern as whatsapp-web-js and baileys plugins). Creates CloudApiAdapter instances with config from env vars.

5. **`docs/31-cloud-api-setup.md`** — Setup documentation for the Cloud API engine

### Modified Files:
- **`.env.example`** — Added Cloud API env vars (CLOUD_API_ACCESS_TOKEN, CLOUD_API_PHONE_NUMBER_ID, etc.)
- **`src/config/configuration.ts`** — Added `cloudApi` config section reading the new env vars
- **`src/config/env.validation.ts`** + spec — Added Cloud API env var validation
- **`src/app.module.ts`** — Imported `CloudApiWebhookModule`
- **`src/engine/engine.factory.ts`** — Registers the cloud-api engine plugin alongside whatsapp-web-js and baileys
- **`src/engine/engine-capability-matrix.ts`** — Added cloud-api support status for all methods
- **`src/engine/engine-parity.spec.ts`** — Updated to include cloud-api in parity tests
- **`src/modules/infra/infra.controller.ts`** + DTO — Added Cloud API config to infra management endpoints
- **`dashboard/src/pages/Infrastructure.tsx`** — Added Cloud API configuration section to the Infrastructure page
- **`dashboard/src/services/api.ts`** — Added Cloud API config API methods
- **`dashboard/src/i18n/locales/en.json`** — Added Cloud API i18n strings

### What the Cloud API adapter does:
- Uses Meta Graph API v21.0 to send text, image, video, audio, document, location, contact, sticker messages
- Supports message reactions, replies, template messages, interactive messages
- Receives inbound messages via webhook dispatch (Meta → our webhook endpoint → adapter)
- Session status is tracked in-memory (no browser/WebSocket connection needed)
- Config: access token, phone number ID, WABA ID, verify token, app secret, graph API version

### What may still need work:
- The adapter likely has stub/unsupported methods for features Cloud API doesn't support (groups management, labels, catalogs, etc.)
- Testing and verification of the full flow
- i18n for other languages beyond English
- The `engine-capability-matrix.ts` entries need verification against actual Cloud API capabilities

---

## Key Design Decisions to Maintain

1. **Dual-database**: Auth/audit always on SQLite (no external dependency for boot), operational data on pluggable SQLite/Postgres
2. **Engine as plugin**: Engines register through the plugin system, making third-party engines possible
3. **Neutral JID dialect**: All engine output normalized to consistent identity format
4. **Conditional module loading**: Queue, MCP, Search, ServeStatic only load when enabled
5. **Three-layer env precedence**: Process env > .env > dashboard-generated file
6. **Non-root Docker**: Root runs only for chown, drops to openwa user via gosu
7. **SSRF protection**: Blocks internal addresses on webhooks and media fetches
8. **Simulate typing**: Anti-ban delays before sends
9. **Engine capability matrix with evidence**: Per-method support documented with library citations, enforced by tests
10. **Per-participant group results**: Group membership ops return individual outcomes

---

## Key File Locations

| Purpose | Path |
|---------|------|
| Entry point | `src/main.ts` |
| Root module | `src/app.module.ts` |
| Configuration | `src/config/configuration.ts` |
| Env validation | `src/config/env.validation.ts` |
| Engine interface | `src/engine/interfaces/whatsapp-engine.interface.ts` |
| Engine factory | `src/engine/engine.factory.ts` |
| Capability matrix | `src/engine/engine-capability-matrix.ts` |
| whatsapp-web.js adapter | `src/engine/adapters/whatsapp-web-js.adapter.ts` |
| Baileys adapter | `src/engine/adapters/baileys.adapter.ts` |
| Cloud API adapter | `src/engine/adapters/cloud-api.adapter.ts` |
| Session service | `src/modules/session/session.service.ts` |
| Message service | `src/modules/message/message.service.ts` |
| Webhook service | `src/modules/webhook/webhook.service.ts` |
| Auth service | `src/modules/auth/auth.service.ts` |
| Plugin loader | `src/core/plugins/plugin-loader.service.ts` |
| Hook manager | `src/core/hooks/hook-manager.service.ts` |
| Infra controller | `src/modules/infra/infra.controller.ts` |
| Dashboard app | `dashboard/src/App.tsx` |
| Dashboard API | `dashboard/src/services/api.ts` |
| Chats page | `dashboard/src/pages/Chats.tsx` |
| Env reference | `.env.example` |
| Dockerfile | `Dockerfile` |
| OpenAPI spec | `openapi.json` |
