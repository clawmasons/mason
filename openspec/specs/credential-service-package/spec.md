# Credential Service Package — WebSocket Client, Access Validation & Audit

**Status:** Implemented
**PRD:** [credential-service](../../../../prds/credential-service/PRD.md)
**PRD Refs:** REQ-001, REQ-005, REQ-006, REQ-007
**Branch:** `credential-service-package`

---

## 1. Problem

The credential service has a resolver but no service layer. There is no way to validate agent access to credentials, log audit trails, or communicate with the proxy over WebSocket. The credential pipeline cannot function without these components.

## 2. Solution

Build the credential service core on top of the existing `CredentialResolver`:

1. **Zod schemas** for credential requests/responses (from PRD Appendix B)
2. **CredentialService class** (SDK mode) — access validation, resolution, audit logging
3. **WebSocket client** — connects to proxy, handles credential request relay
4. **Audit module** — `credential_audit` SQLite table with insert/query functions
5. **CLI entrypoint** — reads config from env, starts WebSocket connection
6. **Barrel export** — SDK API for in-process usage

## 3. Design

### 3.1 Schemas (`src/schemas.ts`)

```typescript
const credentialRequestSchema = z.object({
  id: z.string(),
  key: z.string(),
  agentId: z.string(),
  role: z.string(),
  sessionId: z.string(),
  declaredCredentials: z.array(z.string()),
  timestamp: z.string().optional(),
});

const credentialResponseSchema = z.union([
  z.object({
    id: z.string(),
    key: z.string(),
    value: z.string(),
    source: z.enum(["env", "keychain", "dotenv"]),
  }),
  z.object({
    id: z.string(),
    key: z.string(),
    error: z.string(),
    code: z.enum(["NOT_FOUND", "ACCESS_DENIED", "INVALID_SESSION"]),
  }),
]);

const credentialServiceConfigSchema = z.object({
  dbPath: z.string().optional(),
  envFilePath: z.string().optional(),
  keychainService: z.string().default("mason"),
});
```

Note: `id` field added to correlate requests with responses over WebSocket. `declaredCredentials` replaces `sessionToken` for access validation — the proxy is responsible for session validation and populates this field.

### 3.2 Audit Module (`src/audit.ts`)

SQLite table following the proxy's `db.ts` pattern:

```sql
CREATE TABLE IF NOT EXISTS credential_audit (
  id              TEXT PRIMARY KEY,
  timestamp       TEXT NOT NULL,
  agent_id        TEXT NOT NULL,
  role            TEXT NOT NULL,
  session_id      TEXT NOT NULL,
  credential_key  TEXT NOT NULL,
  outcome         TEXT NOT NULL,
  deny_reason     TEXT,
  source          TEXT
)
```

Functions:
- `openCredentialDatabase(dbPath?)` — opens DB, creates table
- `insertCredentialAudit(db, entry)` — insert audit entry
- `queryCredentialAudit(db, filters?)` — query with optional filters

### 3.3 CredentialService Class (`src/service.ts`)

```typescript
class CredentialService {
  constructor(config: CredentialServiceConfig, resolver: CredentialResolver)
  handleRequest(request: CredentialRequest): Promise<CredentialResponse>
}
```

`handleRequest` flow:
1. Validate that `request.key` is in `request.declaredCredentials` → if not, return `ACCESS_DENIED` and audit
2. Call `resolver.resolve(request.key)` → if error, return `NOT_FOUND` and audit
3. On success, audit with `outcome: "granted"` and return value

### 3.4 WebSocket Client (`src/ws-client.ts`)

```typescript
class CredentialWSClient {
  constructor(service: CredentialService)
  connect(proxyUrl: string, token: string): Promise<void>
  disconnect(): void
}
```

- Connects to `proxyUrl` with `Authorization: Bearer <token>` header
- On message: parse as `CredentialRequest` → `service.handleRequest()` → send `CredentialResponse`
- On close/error: retry up to 3 times with 1s delay
- On max retries: throw/exit

### 3.5 CLI Entrypoint (`src/cli.ts`)

Reads from environment:
- `CREDENTIAL_PROXY_URL` — WebSocket URL to proxy
- `CREDENTIAL_PROXY_TOKEN` — auth token
- `CREDENTIAL_DB_PATH` — optional, defaults to `~/.mason/data/mason.db`
- `CREDENTIAL_ENV_FILE` — optional, path to `.env` file

Instantiates `CredentialResolver` → `CredentialService` → `CredentialWSClient` → connects.

## Requirements

### Requirement: Credential audit database path uses CLI name
The credential service audit module SHALL use `~/.${CLI_NAME_LOWERCASE}/data/${CLI_NAME_LOWERCASE}.db` (currently `~/.mason/data/mason.db`) as the default database path. The `CREDENTIAL_DB_PATH` environment variable SHALL remain unchanged (it is credential-service-specific, not CLI-name-prefixed).

#### Scenario: Default audit database path uses CLI name
- **WHEN** the credential service opens its audit database without an explicit path
- **THEN** it SHALL use `~/.mason/data/mason.db` as the default path
- **AND** the path SHALL be constructed using `CLI_NAME_LOWERCASE` from `@clawmasons/shared`

## 4. Test Plan

### service.test.ts
- Access granted: request key in declaredCredentials → returns resolved value
- Access denied: request key NOT in declaredCredentials → returns ACCESS_DENIED
- Resolution error: key in declaredCredentials but resolver returns NOT_FOUND → returns NOT_FOUND
- Audit: after each request, audit entry exists with correct fields

### audit.test.ts
- Insert and query audit entry
- Query with filters (agent_id, outcome, credential_key)
- Query empty table returns empty array

### ws-client.test.ts
- Connect to mock WS server with auth token
- Receive request, process, send response
- Reconnect on connection close (up to 3 retries)

## 5. Files

| File | Action | Description |
|------|--------|-------------|
| `packages/credential-service/package.json` | Modify | Add ws, better-sqlite3 deps; add bin entry |
| `packages/credential-service/src/schemas.ts` | New | Zod schemas |
| `packages/credential-service/src/audit.ts` | New | Audit table and functions |
| `packages/credential-service/src/service.ts` | New | CredentialService class |
| `packages/credential-service/src/ws-client.ts` | New | WebSocket client |
| `packages/credential-service/src/cli.ts` | New | CLI entrypoint |
| `packages/credential-service/src/index.ts` | Modify | Expanded barrel export |
| `packages/credential-service/tests/service.test.ts` | New | Service unit tests |
| `packages/credential-service/tests/audit.test.ts` | New | Audit unit tests |
| `packages/credential-service/tests/ws-client.test.ts` | New | WebSocket client tests |
