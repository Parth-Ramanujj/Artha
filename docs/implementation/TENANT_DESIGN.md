# Multi-Tenant Isolation Design

> Status: APPROVED DESIGN — implementation in Phase 3

## Design Philosophy

Evolve the existing API-key + session model into a business-aware platform. The tenant boundary is a **Business** entity that owns sessions, and through sessions, all operational data. We preserve the existing `allowedSessions` scoping as a secondary restriction layer.

**Key principle:** Session is already the natural ownership boundary for 90% of the data model (messages, webhooks, templates, etc.). Rather than adding `businessId` to every table, we add it to `sessions` and `api_keys` — then scope enforcement flows through the existing `sessionId`-based queries.

---

## Entity Design

### New Entities

#### Business (data DB)

```
Table: businesses
- id: UUID (PK)
- name: varchar(100), UNIQUE
- slug: varchar(100), UNIQUE (URL-safe identifier)
- plan: varchar(50), default 'free' (future: billing plans)
- isActive: boolean, default true
- settings: simple-json, nullable (per-business config)
- createdAt: datetime
- updatedAt: datetime
```

#### BusinessMembership (data DB)

```
Table: business_memberships
- id: UUID (PK)
- businessId: varchar(36), FK → businesses(id) ON DELETE CASCADE
- apiKeyId: varchar(36), UNIQUE (each key belongs to exactly one business)
- businessRole: varchar(20) — 'owner' | 'admin' | 'agent' | 'viewer'
- createdAt: datetime
- updatedAt: datetime
Indexes:
- UNIQUE(businessId, apiKeyId)
- INDEX(apiKeyId) — for fast lookup during auth
```

### Modified Entities

#### Session (data DB — add column)

```
- businessId: varchar(36), nullable (nullable for migration; non-null enforced in app after migration)
- INDEX(businessId)
```

#### ApiKey (main DB — add column)

```
- businessId: varchar(36), nullable (nullable for migration)
- INDEX(businessId)
```

**Note on cross-database FK:** ApiKey is in the main DB (SQLite), Business is in the data DB. No FK constraint is possible. The `businessId` on ApiKey is a logical reference enforced at the application layer.

---

## Role Mapping

| Existing Role | Business Role | Platform Scope | Business Scope |
|---|---|---|---|
| ADMIN (unscoped key) | — | Full platform access | Can access any business |
| ADMIN (business-scoped) | owner / admin | Own business only | Full business management |
| OPERATOR (business-scoped) | agent | Own business only | Send messages, manage contacts, resolve conversations |
| VIEWER (business-scoped) | viewer | Own business only | Read-only access |

### Platform Admin vs Business Admin
- **Platform Admin:** ApiKey with role=ADMIN and NO businessId — sees everything, manages infrastructure, plugins, platform settings. This preserves the existing unscoped-admin behavior.
- **Business Admin:** ApiKey with role=ADMIN and businessId set — full control within their business but cannot access other businesses or platform-level settings.

---

## Scope Enforcement Strategy

### Layer 1: Auth Guard Enhancement

Modify `ApiKeyGuard` to:
1. After validating the key, resolve the key's `businessId` (from ApiKey or BusinessMembership lookup)
2. Attach `businessId` to the request context alongside the existing `apiKey`
3. When a `sessionId` is resolved from route params, verify the session's `businessId` matches the key's `businessId`

### Layer 2: Session Ownership Check

Before any session operation, verify `session.businessId === request.businessId`. This is already partially done via `allowedSessions` — we add a business-level check that cannot be bypassed.

### Layer 3: Data Queries

Most data queries already filter by `sessionId`. Since sessions are owned by businesses, the existing queries naturally scope to the right business. For cross-session queries (stats, audit, search), add `businessId` filter.

### Scoping Matrix — Every Resource Family

| Resource | Current Scope | New Scope | How |
|---|---|---|---|
| Sessions | allowedSessions | businessId on session | Guard checks session.businessId matches key.businessId |
| Messages | sessionId | Via session.businessId | Already scoped by sessionId; cross-session queries add businessId |
| Webhooks | sessionId FK | Via session.businessId | FK cascade from session; list queries filter by business sessions |
| Templates | sessionId FK | Via session.businessId | Same as webhooks |
| Audit Logs | sessionId (query) | businessId column on audit_logs | Add businessId to AuditLog entity |
| API Keys | global | businessId on api_key | Filter by businessId in list/CRUD |
| WebSocket | sessionId rooms | businessId check on subscribe | Verify session ownership before joining room |
| Search | sessionId filter | businessId filter | Add WHERE sessionId IN (business sessions) |
| Stats | global or sessionId | businessId filter | Aggregate only business-owned sessions |
| Plugins | global (admin only) | Remain global (platform admin only) | No change — plugins are platform infrastructure |
| Plugin Instances | sessionScope | Via session.businessId | Verify session ownership |
| Integration Instances | sessionScope | Via session.businessId | Same as plugin instances |
| Status Store | sessionId | Via session.businessId | Already scoped by sessionId |
| Baileys Store | sessionId FK | Via session.businessId | FK cascade from session |
| LID Mappings | global (cross-session) | Remain global | Privacy-ID resolution is not business-specific |
| Infrastructure | global (admin only) | Platform admin only | @RequireUnscopedKey already enforces this |
| Media/Downloads | sessionId | Via session.businessId | Verify session ownership before serving |
| Cache | sessionId keys | No change needed | Cache keys already include sessionId |
| Queue Jobs | sessionId in payload | Add businessId to payload | Verify ownership before processing |

---

## Migration Strategy

### Step 1: Create businesses table (data DB)
- Standard migration, no data changes

### Step 2: Create business_memberships table (data DB)
- Standard migration, no data changes

### Step 3: Add businessId to sessions (data DB)
- Add nullable column `businessId` to sessions
- Create a "Default" business
- UPDATE all existing sessions SET businessId = default_business.id
- Add index on businessId

### Step 4: Add businessId to api_keys (main DB)
- Add nullable column `businessId` to api_keys
- Existing unscoped admin keys: keep businessId NULL (platform admin)
- Existing scoped keys: can be assigned to default business or remain unassigned (admin decides)
- Note: main DB migration (separate migration directory)

### Step 5: Add businessId to audit_logs (main DB)
- Add nullable column `businessId` to audit_logs
- Existing logs: leave businessId NULL (historical)
- New logs: populated from request context

### Rollback
- Remove columns in reverse order
- Drop tables in reverse order
- No data loss (columns are added, not replaced)

---

## API Design

### New Endpoints

```
POST   /businesses                 — Create business (platform admin)
GET    /businesses                 — List businesses (platform admin: all; scoped: own)
GET    /businesses/:id             — Get business details
PATCH  /businesses/:id             — Update business settings
DELETE /businesses/:id             — Delete business (platform admin only)

POST   /businesses/:id/memberships — Add API key to business
GET    /businesses/:id/memberships — List business members
PATCH  /businesses/:id/memberships/:mid — Update member role
DELETE /businesses/:id/memberships/:mid — Remove member
```

### Modified Endpoints

```
POST /sessions — Now requires businessId in body (or derived from authenticated key)
GET  /sessions — Filtered by key's businessId
GET  /stats/*  — Filtered by key's businessId
GET  /audit    — Filtered by key's businessId
```

### Backward Compatibility

- Platform admin keys (no businessId) continue to work as before
- Existing session-scoped keys continue to work (allowedSessions is AND-ed with businessId)
- All existing REST API contracts preserved; business scoping is additive
- New `X-Business-Id` header optional (for platform admins switching business context)

---

## Frontend Changes (Phase 10)

- Business selector in header/sidebar for platform admins
- Business settings page (name, members)
- Session creation now associated with active business
- All data queries scoped to active business context
- React Query cache keys include businessId

---

## Files That Will Change in Phase 3

### New Files
- `src/modules/business/business.entity.ts`
- `src/modules/business/business-membership.entity.ts`
- `src/modules/business/business.module.ts`
- `src/modules/business/business.service.ts`
- `src/modules/business/business.controller.ts`
- `src/modules/business/dto/` (create, update, membership DTOs)
- `src/database/migrations/TIMESTAMP-AddBusinesses.ts`
- `src/database/migrations/TIMESTAMP-AddBusinessIdToSessions.ts`
- `src/database/migrations-main/TIMESTAMP-AddBusinessIdToApiKeys.ts`
- `src/database/migrations-main/TIMESTAMP-AddBusinessIdToAuditLogs.ts`

### Modified Files
- `src/app.module.ts` — Import BusinessModule
- `src/modules/auth/guards/api-key.guard.ts` — Resolve and attach businessId
- `src/modules/auth/auth.service.ts` — Business-scoped key validation
- `src/modules/session/session.entity.ts` — Add businessId column
- `src/modules/session/session.service.ts` — Business-scoped session creation/listing
- `src/modules/session/session.controller.ts` — Accept/derive businessId
- `src/modules/auth/entities/api-key.entity.ts` — Add businessId column
- `src/modules/audit/entities/audit-log.entity.ts` — Add businessId column
- `src/modules/audit/audit.service.ts` — Business-scoped audit queries
- `src/modules/events/events.gateway.ts` — Verify business ownership on subscribe
- `src/modules/stats/stats.service.ts` — Business-scoped aggregation
- `src/common/security/session-scope.ts` — Add business-aware scope resolution

### Test Files (new)
- `src/modules/business/business.service.spec.ts`
- `src/modules/business/business.controller.spec.ts`
- Cross-tenant isolation integration tests

---

## Risks

1. **Main DB is always SQLite** — No FK to businesses table in data DB. Business ownership of API keys is application-enforced only. Mitigated by: consistent service-layer checks.

2. **LidMapping is cross-session** — Multi-tenant does NOT break this because LID mappings are phone-number-level, not business-level. A phone number's LID is the same regardless of which business resolved it.

3. **Existing data migration** — All existing sessions get assigned to a "Default" business. API keys without business assignment continue to work as platform admin keys. No data loss, no permission widening.

4. **Performance** — Adding `WHERE businessId = ?` to session queries is negligible. The business lookup during auth is a single indexed query, cached per-request.

5. **Breaking changes** — None for existing API consumers. New `businessId` field is optional in responses and not required in existing requests.
