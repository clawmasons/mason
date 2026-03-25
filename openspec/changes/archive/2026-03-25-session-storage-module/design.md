## Context

The `acp-refactor` PRD (REQ-005, REQ-008, REQ-010) requires session persistence under `{cwd}/.mason/sessions/{sessionId}/meta.json`. This module lives in `packages/shared` so it can serve both the ACP handlers and future CLI features like `mason run --resume`.

## Goals / Non-Goals

**Goals:**
- Provide typed CRUD operations for session metadata: create, read, update, list, close
- Use UUID v7 for session IDs (time-ordered, sortable)
- Store each session as `{cwd}/.mason/sessions/{sessionId}/meta.json`
- Atomic writes to prevent corruption
- Zero external dependencies (use `node:crypto` and `node:fs/promises`)

**Non-Goals:**
- ACP protocol handling (that's CHANGE 3+)
- Session history/conversation storage (future P1)
- Session cleanup/garbage collection (future)
- Pagination for `listSessions` (simple scan is sufficient for now)

## Decisions

### 1. UUID v7 implementation

UUID v7 embeds a Unix timestamp in the first 48 bits, making IDs naturally time-ordered. Node.js only provides `randomUUID()` (v4). Rather than adding a dependency, implement a minimal UUID v7 generator:

```typescript
function uuidv7(): string {
  const now = Date.now();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Encode 48-bit timestamp in bytes 0-5
  bytes[0] = (now / 2**40) & 0xff;
  bytes[1] = (now / 2**32) & 0xff;
  bytes[2] = (now / 2**24) & 0xff;
  bytes[3] = (now / 2**16) & 0xff;
  bytes[4] = (now / 2**8) & 0xff;
  bytes[5] = now & 0xff;
  // Set version 7 (0111) in byte 6
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  // Set variant 10xx in byte 8
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  // Format as UUID string
  return formatUuid(bytes);
}
```

This keeps the package dependency-free. The implementation follows RFC 9562 Section 5.7.

### 2. Atomic writes via write-then-rename

To prevent corruption from concurrent writes or crashes mid-write:
1. Write to a temporary file `meta.json.tmp` in the same directory
2. Rename to `meta.json` (atomic on all OSes for same-filesystem rename)

### 3. Session type

```typescript
export interface Session {
  sessionId: string;       // UUID v7
  cwd: string;             // project directory
  agent: string;           // agent identifier
  role: string;            // role identifier
  firstPrompt: string | null;  // first user prompt (used as session title)
  lastUpdated: string;     // ISO 8601 timestamp
  closed: boolean;         // whether session is closed
  closedAt: string | null; // ISO 8601 timestamp when closed
}
```

### 4. Function signatures

```typescript
export function createSession(cwd: string, agent: string, role: string): Promise<Session>
export function readSession(cwd: string, sessionId: string): Promise<Session | null>
export function updateSession(cwd: string, sessionId: string, updates: Partial<Session>): Promise<void>
export function listSessions(cwd: string): Promise<Session[]>
export function closeSession(cwd: string, sessionId: string): Promise<void>
```

All functions are async since they perform file I/O.

### 5. Directory structure

```
{cwd}/.mason/sessions/
  {uuid-v7-1}/
    meta.json
  {uuid-v7-2}/
    meta.json
```

The session directory is created by `createSession`. Future changes can add more files to each session directory (conversation history, artifacts, etc.).

### 6. `listSessions` behavior

- Scans `{cwd}/.mason/sessions/*/meta.json` using `fs.readdir`
- Filters out closed sessions (`closed: true`)
- Sorts by `lastUpdated` descending (most recent first)
- Returns empty array if sessions directory doesn't exist

### 7. Error handling

- `readSession` returns `null` for non-existent sessions (not an error)
- `updateSession` and `closeSession` throw if the session doesn't exist
- `listSessions` gracefully handles missing directories and malformed `meta.json` files (skips them)

## Test Coverage

Unit tests in `packages/shared/tests/session/session-store.test.ts` using temp directories:

1. **createSession** — writes correct `meta.json` with all fields, sessionId is valid UUID v7, `closed` is false, `closedAt` is null, `firstPrompt` is null
2. **readSession** — returns matching data for existing session, returns null for non-existent session
3. **updateSession** — persists partial updates, preserves unchanged fields
4. **listSessions** — returns only non-closed sessions, sorted by `lastUpdated` desc, returns empty array when no sessions exist
5. **closeSession** — sets `closed: true` and `closedAt` timestamp, closed session excluded from `listSessions`
6. **UUID v7 ordering** — two sessions created sequentially have time-ordered IDs (id1 < id2 lexicographically)
7. **Atomic writes** — `updateSession` uses write-then-rename pattern
8. **Malformed meta.json** — `listSessions` skips sessions with invalid JSON

## File-by-File Plan

| Action | File | Notes |
|--------|------|-------|
| CREATE | `packages/shared/src/session/session-store.ts` | Session CRUD + UUID v7 |
| CREATE | `packages/shared/src/session/index.ts` | Barrel export |
| MODIFY | `packages/shared/src/index.ts` | Add session exports |
| CREATE | `packages/shared/tests/session/session-store.test.ts` | Unit tests |
