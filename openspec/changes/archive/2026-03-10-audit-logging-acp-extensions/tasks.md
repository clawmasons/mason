# Tasks: Audit Logging ACP Extensions

**Date:** 2026-03-10

## Completed

- [x] Add `session_type` and `acp_client` nullable columns to `audit_log` table via ALTER TABLE migration
- [x] Extend `AuditLogEntry` type with optional `session_type` and `acp_client` fields
- [x] Extend `AuditLogEntry.status` type to include `"dropped"` value
- [x] Update `insertAuditLog()` to explicitly map all named parameters (robustness fix)
- [x] Extend `AuditLogFilters` with optional `session_type` filter
- [x] Update `queryAuditLog()` to support `session_type` filtering
- [x] Extend `HookContext` with optional `sessionType` and `acpClient` fields
- [x] Update `auditPostHook()` to include ACP metadata in audit entries
- [x] Create `logDroppedServers()` function for dropped MCP server audit entries
- [x] Export `logDroppedServers` and `DroppedServer` type from proxy package
- [x] Add `sessionType` and `acpClient` to `ChapterProxyServerConfig`
- [x] Update `server.ts` HookContext construction (2 call sites) to include ACP metadata
- [x] Add `acpClient` to `AcpSessionConfig`
- [x] Update `generateAcpComposeYml()` to include `CHAPTER_SESSION_TYPE` and `CHAPTER_ACP_CLIENT` env vars
- [x] Update proxy command (`proxy.ts`) to read `CHAPTER_SESSION_TYPE` and `CHAPTER_ACP_CLIENT` env vars
- [x] Update audit hook spec with new ACP requirements
- [x] Add 3 new auditPostHook tests (ACP metadata, backward compat, session_type without client)
- [x] Add 6 new logDroppedServers tests (dropped entries, reason, empty list, null client, filter, error handling)
- [x] Verify type check passes (`npx tsc --noEmit`)
- [x] Verify lint passes (`npx eslint`)
- [x] Verify all tests pass (918 tests across 54 files, including 9 new tests)
