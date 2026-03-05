## Architecture

One new module: `src/proxy/db.ts`. No changes to existing modules.

### Database Location

Default path: `~/.forge/forge.db`. The `openDatabase()` function accepts an optional `dbPath` parameter for testing (in-memory via `:memory:` or temp files).

### Schema

Matches PRD REQ-008 exactly:

```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id           TEXT PRIMARY KEY,
  agent_name   TEXT NOT NULL,
  role_name    TEXT NOT NULL,
  app_name     TEXT NOT NULL,
  tool_name    TEXT NOT NULL,
  arguments    TEXT,
  result       TEXT,
  status       TEXT NOT NULL,
  duration_ms  INTEGER,
  timestamp    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id           TEXT PRIMARY KEY,
  agent_name   TEXT NOT NULL,
  role_name    TEXT NOT NULL,
  app_name     TEXT NOT NULL,
  tool_name    TEXT NOT NULL,
  arguments    TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',
  requested_at TEXT NOT NULL,
  resolved_at  TEXT,
  resolved_by  TEXT,
  ttl_seconds  INTEGER NOT NULL DEFAULT 300
);
```

### WAL Mode

Enabled immediately after opening: `PRAGMA journal_mode=WAL`. This allows concurrent reads from the forge TUI while the proxy writes.

### API Surface

```typescript
// Types
interface AuditLogEntry {
  id: string;
  agent_name: string;
  role_name: string;
  app_name: string;
  tool_name: string;
  arguments?: string;
  result?: string;
  status: "success" | "error" | "denied" | "timeout";
  duration_ms?: number;
  timestamp: string;
}

interface ApprovalRequest {
  id: string;
  agent_name: string;
  role_name: string;
  app_name: string;
  tool_name: string;
  arguments?: string;
  status: "pending" | "approved" | "denied";
  requested_at: string;
  resolved_at?: string;
  resolved_by?: string;
  ttl_seconds: number;
}

interface AuditLogFilters {
  agent_name?: string;
  app_name?: string;
  tool_name?: string;
  status?: string;
  limit?: number;
}

// Functions
function openDatabase(dbPath?: string): Database;
function insertAuditLog(db: Database, entry: AuditLogEntry): void;
function queryAuditLog(db: Database, filters?: AuditLogFilters): AuditLogEntry[];
function createApprovalRequest(db: Database, req: ApprovalRequest): void;
function getApprovalRequest(db: Database, id: string): ApprovalRequest | undefined;
function updateApprovalStatus(db: Database, id: string, status: "approved" | "denied", resolvedBy?: string): void;
```

All functions take a `Database` instance (from `better-sqlite3`) as the first argument. This makes testing trivial — pass an in-memory database.

### ID Generation

Uses `crypto.randomUUID()` for both audit log entries and approval requests. Callers provide the ID so they can correlate pre/post hook entries.

## Decisions

1. **`better-sqlite3` over `sql.js` or `node-sqlite3`**: Synchronous API is simpler for this use case (no async complexity in hook pipeline). `better-sqlite3` is the most popular synchronous SQLite binding for Node.js.
2. **Functions over class**: Stateless functions with explicit `db` parameter are simpler than a class and make testing easier.
3. **Caller-provided IDs**: The caller generates IDs with `crypto.randomUUID()`. This lets the audit hook correlate pre-call and post-call entries for the same tool invocation.
4. **ISO 8601 timestamps**: All timestamps use `new Date().toISOString()` for consistency and sortability.
