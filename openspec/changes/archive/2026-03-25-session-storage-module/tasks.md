## 1. Create Session Store Module

- [x] 1.1 Create directory `packages/shared/src/session/`
- [x] 1.2 Create `packages/shared/src/session/session-store.ts` with:
  - `Session` interface (sessionId, cwd, agent, role, firstPrompt, lastUpdated, closed, closedAt)
  - `uuidv7()` helper function (RFC 9562 Section 5.7 — 48-bit timestamp + random)
  - `sessionsDir(cwd)` helper returning `{cwd}/.mason/sessions`
  - `sessionMetaPath(cwd, sessionId)` helper returning `{cwd}/.mason/sessions/{sessionId}/meta.json`
  - `writeMetaAtomic(path, session)` helper for write-then-rename
  - `createSession(cwd, agent, role): Promise<Session>`
  - `readSession(cwd, sessionId): Promise<Session | null>`
  - `updateSession(cwd, sessionId, updates: Partial<Session>): Promise<void>`
  - `listSessions(cwd): Promise<Session[]>`
  - `closeSession(cwd, sessionId): Promise<void>`
- [x] 1.3 Create `packages/shared/src/session/index.ts` barrel exporting `Session` type and all functions

## 2. Update Shared Package Exports

- [x] 2.1 Add session module exports to `packages/shared/src/index.ts`

## 3. Create Unit Tests

- [x] 3.1 Create `packages/shared/tests/session/` directory
- [x] 3.2 Create `packages/shared/tests/session/session-store.test.ts` with test cases:
  - `createSession` — writes meta.json with correct fields, closed=false, closedAt=null, firstPrompt=null
  - `createSession` — sessionId is valid UUID format
  - `readSession` — returns matching data for existing session
  - `readSession` — returns null for non-existent session
  - `updateSession` — persists partial updates, preserves unchanged fields
  - `listSessions` — returns only non-closed sessions sorted by lastUpdated desc
  - `listSessions` — returns empty array when no sessions directory exists
  - `closeSession` — sets closed=true and closedAt timestamp
  - `closeSession` — closed session excluded from listSessions
  - UUID v7 ordering — sequential sessions have lexicographically ordered IDs
  - `listSessions` — skips sessions with malformed meta.json

## 4. Verification

- [x] 4.1 `npx tsc --noEmit` passes
- [x] 4.2 `npx eslint src/ tests/` passes in `packages/shared/`
- [x] 4.3 `npx vitest run packages/shared/tests/` passes (all new + existing tests)
