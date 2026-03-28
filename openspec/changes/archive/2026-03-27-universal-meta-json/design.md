## Context

The session store in `packages/shared/src/session/session-store.ts` provides CRUD operations for session metadata stored in `.mason/sessions/{id}/meta.json`. It already generates UUID v7 IDs and handles atomic writes. However, it lacks `masonSessionId` and `agentSessionId` fields required by the resume feature (PRD sections 4.1 and 4.3).

Meanwhile, `packages/cli/src/cli/commands/run-agent.ts` generates its own 8-character hex session IDs via `generateSessionId()` and passes them to `createSessionDirectory()`. These CLI sessions never create a `meta.json`, making them invisible to the session listing and resume system.

## Goals / Non-Goals

**Goals:**
- Add `masonSessionId` and `agentSessionId` to the `Session` interface and `createSession()`
- Replace CLI's `generateSessionId()` with the session store's `createSession()` so all sessions get `meta.json`
- Maintain backward compatibility -- existing code that reads sessions without the new fields continues to work

**Non-Goals:**
- Creating the "latest" symlink (that's CHANGE 2)
- Moving `agent-launch.json` to per-session directory (that's CHANGE 3)
- Adding the `--resume` CLI flag (that's CHANGE 6)
- Removing `generateSessionId()` entirely -- it may still be used by tests; we stop using it for session directory creation

## Decisions

### 1. `masonSessionId` is always equal to `sessionId`

The field exists so that code running inside a container (reading the mounted `meta.json`) can identify the mason session without needing external context. Both fields are set in `createSession()` to the same UUID v7 value.

**Alternative**: Derive `masonSessionId` from `sessionId` at read time -- rejected because the PRD specifies it should be stored explicitly in `meta.json` for container accessibility.

### 2. `agentSessionId` starts as `null`

The agent's internal session ID (e.g., Claude Code's `CLAUDE_SESSION_ID`) is not known at session creation time. It's populated later by the agent's `SessionStart` hook (CHANGE 5). So `createSession()` initializes it to `null`.

### 3. CLI calls `createSession()` before `createSessionDirectory()`

In `run-agent.ts`, each execution path that calls `createSessionDirectory()` will first call `createSession(projectDir, agentType, roleType)` from the session store. The returned `session.sessionId` (a UUID v7) replaces the old `generateSessionId()` call and is passed as the `sessionId` option to `createSessionDirectory()`.

This means the session directory gets both:
- A `meta.json` (from `createSession()`)
- A `docker-compose.yaml` and logs directory (from `createSessionDirectory()`)

The order matters: `createSession()` creates the directory and writes `meta.json`, then `createSessionDirectory()` writes `docker-compose.yaml` into the already-existing directory.

### 4. `generateSessionId()` is not removed, just unused for session dirs

The function still exists (exported) but is no longer called for session directory creation. This avoids breaking any external tests or utilities that may reference it. It can be deprecated/removed in a follow-up cleanup.

### 5. Dependency injection for testing

The `run-agent.ts` code already uses a `deps` object for dependency injection in tests. We add `createSessionFn` to the existing `RunActionDependencies` type so tests can provide a mock `createSession`.

## Test Coverage

### Unit tests (packages/shared/tests/session/session-store.test.ts)

- **(a)** `createSession()` returns session with `masonSessionId === sessionId`
- **(b)** `createSession()` returns `agentSessionId: null`
- **(c)** `updateSession()` can set `agentSessionId` to a string value
- **(d)** `readSession()` round-trips both new fields (create, read, verify `masonSessionId` and `agentSessionId` are present and correct)

### Unit tests (packages/cli/tests/cli/run-agent.test.ts)

- **(e)** Verify that `createSessionDirectory` receives a UUID v7 session ID (not an 8-char hex string)
- **(f)** Verify that `generateSessionId()` is no longer called in the session creation flow (it may still exist as exported but unused)

## Risks / Trade-offs

**[Backward compatibility of meta.json]** -- Sessions created before this change won't have `masonSessionId` or `agentSessionId`. `readSession()` will still return the parsed JSON, but the new fields will be `undefined`. Callers that depend on these fields (introduced in later changes) must handle the `undefined` case. This is acceptable since resume is a new feature.

**[Two-step directory creation]** -- `createSession()` creates the directory and writes `meta.json`, then `createSessionDirectory()` writes additional files into the same directory. If `createSessionDirectory()` fails after `createSession()` succeeds, we have a session directory with only `meta.json`. This is fine -- the session will be listed but won't be launchable until the compose file is also present.
