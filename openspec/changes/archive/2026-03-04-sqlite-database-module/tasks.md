## 1. Add better-sqlite3 Dependency

- [ ] 1.1 Install `better-sqlite3` as a runtime dependency
- [ ] 1.2 Install `@types/better-sqlite3` as a dev dependency

## 2. Implement Database Module

- [ ] 2.1 Create `src/proxy/db.ts` with types: `AuditLogEntry`, `ApprovalRequest`, `AuditLogFilters`
- [ ] 2.2 Implement `openDatabase(dbPath?)` — opens DB, enables WAL, creates both tables
- [ ] 2.3 Implement `insertAuditLog(db, entry)` — insert audit log row
- [ ] 2.4 Implement `queryAuditLog(db, filters?)` — query with optional filters (agent_name, app_name, tool_name, status, limit)
- [ ] 2.5 Implement `createApprovalRequest(db, req)` — insert approval request
- [ ] 2.6 Implement `getApprovalRequest(db, id)` — fetch by ID
- [ ] 2.7 Implement `updateApprovalStatus(db, id, status, resolvedBy?)` — update status with resolved_at timestamp

## 3. Write Tests

- [ ] 3.1 Create `tests/proxy/db.test.ts`
- [ ] 3.2 Test: `openDatabase` creates both tables and enables WAL mode
- [ ] 3.3 Test: `insertAuditLog` inserts a row and `queryAuditLog` retrieves it
- [ ] 3.4 Test: `queryAuditLog` filters by agent_name, app_name, tool_name, status
- [ ] 3.5 Test: `queryAuditLog` respects limit parameter
- [ ] 3.6 Test: `createApprovalRequest` inserts a pending request
- [ ] 3.7 Test: `getApprovalRequest` retrieves by ID, returns undefined for unknown ID
- [ ] 3.8 Test: `updateApprovalStatus` updates status, resolved_at, and resolved_by
