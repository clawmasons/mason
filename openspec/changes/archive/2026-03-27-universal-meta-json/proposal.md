## Why

The session store (`session-store.ts`) currently supports all sessions, but it lacks two fields required for session resume: `masonSessionId` (an explicit copy of `sessionId` accessible from inside the container) and `agentSessionId` (the agent's internal session ID, written by a hook). Additionally, CLI-initiated `mason run` sessions use an 8-character hex session ID (`generateSessionId()`) rather than the UUID v7 from the session store, so these sessions don't create `meta.json` and are invisible to resume.

This change bridges that gap so every session -- CLI and ACP -- has a `meta.json` with the fields needed for resume.

## What Changes

- Extend the `Session` interface in `packages/shared/src/session/session-store.ts` with two new fields:
  - `masonSessionId: string` -- always equals `sessionId`, stored explicitly for container access
  - `agentSessionId: string | null` -- populated later by the agent's SessionStart hook, initialized to `null`
- Update `createSession()` to populate `masonSessionId` (set to `sessionId`) and `agentSessionId` (set to `null`)
- Modify `packages/cli/src/cli/commands/run-agent.ts` to call `createSession()` from the session store at the start of each `mason run` invocation, replacing `generateSessionId()` with the UUID v7 returned by the session store
- Pass the resulting `sessionId` to `createSessionDirectory()` via the existing `sessionId` option

## Capabilities

### New Capabilities

- `Session` interface includes `masonSessionId` and `agentSessionId` fields
- All CLI-initiated sessions create `meta.json` in `.mason/sessions/{uuid-v7}/`

### Modified Capabilities

- `createSession()` returns sessions with the two new fields populated
- `run-agent.ts` uses `createSession()` + UUID v7 instead of `generateSessionId()` for session directory creation

## Impact

- **Code**: `packages/shared/src/session/session-store.ts` (type + `createSession`), `packages/cli/src/cli/commands/run-agent.ts` (session creation flow)
- **Dependencies**: `run-agent.ts` gains a dependency on `createSession` from `@clawmasons/shared`
- **Testing**: Existing session-store tests updated for new fields; new tests for `masonSessionId === sessionId` and `agentSessionId: null` invariants
- **Compatibility**: Backward compatible -- new fields are additive. Existing `meta.json` files without the new fields will still parse (TypeScript structural typing), and `readSession` returns whatever is on disk.
