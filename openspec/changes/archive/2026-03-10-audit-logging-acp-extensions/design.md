# Design: Audit Logging ACP Extensions

**Date:** 2026-03-10

## Approach

Extend the existing audit logging infrastructure with two new nullable columns and an extended `HookContext` type. The design prioritizes backward compatibility -- existing direct proxy sessions continue to work identically with `session_type = null`.

### Schema Migration

The `audit_log` table gains two nullable columns:

```sql
ALTER TABLE audit_log ADD COLUMN session_type TEXT;
ALTER TABLE audit_log ADD COLUMN acp_client TEXT;
```

Since SQLite `CREATE TABLE IF NOT EXISTS` is idempotent and we use it at database open time, the migration is handled by adding the columns with `ALTER TABLE` wrapped in try/catch (columns may already exist). This keeps the single-file schema approach.

### Extended Types

```typescript
// AuditLogEntry gains optional ACP fields
interface AuditLogEntry {
  // ... existing fields ...
  session_type?: string;  // "acp" | null (null = direct proxy)
  acp_client?: string;    // editor name from ACP handshake (e.g., "zed", "jetbrains")
}

// HookContext gains ACP metadata
interface HookContext {
  // ... existing fields ...
  sessionType?: string;   // "acp" | undefined
  acpClient?: string;     // editor name | undefined
}

// Status type extended
type AuditStatus = "success" | "error" | "denied" | "timeout" | "dropped";
```

### Data Flow

```
ACP client connects
  |
  +-- ACP session starts with metadata (session_type: "acp", acp_client from handshake)
  +-- Proxy container receives env vars:
  |     CHAPTER_SESSION_TYPE=acp
  |     CHAPTER_ACP_CLIENT=zed
  +-- ChapterProxyServer reads env vars, passes to HookContext
  +-- Every auditPostHook call includes session_type and acp_client
  |
  +-- Dropped servers logged via logDroppedServers()
       Each gets an audit entry with status="dropped", tool_name=server_name
```

### logDroppedServers Function

```typescript
function logDroppedServers(
  db: Database.Database,
  unmatched: UnmatchedServer[],
  agentName: string,
  roleName: string,
  acpClient?: string,
): void
```

Creates one audit entry per dropped server with:
- `app_name`: the unmatched server name
- `tool_name`: the unmatched server name
- `status`: "dropped"
- `session_type`: "acp"
- `acp_client`: from handshake (if available)
- `result`: the drop reason
- `duration_ms`: 0

### Environment Variable Approach

The proxy container receives ACP metadata through environment variables (consistent with how `CHAPTER_PROXY_TOKEN` and `CREDENTIAL_PROXY_TOKEN` are already passed):

- `CHAPTER_SESSION_TYPE` -- "acp" for ACP sessions
- `CHAPTER_ACP_CLIENT` -- editor name (if available)

The `ChapterProxyServer` config gains optional `sessionType` and `acpClient` fields. The proxy command reads these from env vars.

### Backward Compatibility

- All new columns are nullable -- existing entries unaffected
- `session_type = null` means direct proxy session (no code changes needed for direct proxy path)
- HookContext new fields are optional -- existing callers don't need to provide them
- Status type extended with "dropped" -- existing status values unchanged
- INSERT statement uses named parameters so missing columns get NULL automatically

### Key Design Decisions

1. **Nullable columns, no migration** -- SQLite doesn't support complex migrations. We add columns with `ALTER TABLE ... ADD COLUMN` at database open time, wrapped in try/catch for idempotency.

2. **Environment variables for metadata** -- Same pattern as existing token passing. Simple, no new protocols.

3. **logDroppedServers in audit module** -- The function lives alongside the existing audit hooks since it writes to the same table.

4. **Status "dropped" as a new status** -- Rather than overloading "denied", we add a purpose-specific status that clearly distinguishes dropped-server events from tool-call denials.
