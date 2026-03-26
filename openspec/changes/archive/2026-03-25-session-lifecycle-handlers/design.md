## Design: Session Lifecycle Handlers

### Architecture

All four handlers follow the same pattern: validate input, delegate to the session store for persistence, manage in-memory state, and return ACP-typed responses. The handlers are added to the existing `createMasonAcpAgent()` factory in `acp-agent.ts`.

### Handler Details

#### `listSessions(params: ListSessionsRequest): ListSessionsResponse`

1. Extract optional `cwd` and `cursor` from params.
2. If `cwd` is provided, call `listSessions(cwd)` from session store (returns non-closed sessions sorted by `lastUpdated` desc).
3. If no `cwd`, return empty array (we require cwd to know which `.mason/sessions/` to scan).
4. Map each `Session` to ACP `SessionInfo`: `{ sessionId, cwd, title: firstPrompt, updatedAt: lastUpdated }`.
5. Return `{ sessions, nextCursor: null }` (no pagination for now).

#### `loadSession(params: LoadSessionRequest): LoadSessionResponse`

1. Extract `sessionId`, `cwd`, and `mcpServers` from params.
2. Call `readSession(cwd, sessionId)` from session store.
3. If not found, throw `InvalidParams`.
4. Run discovery via `discoverForCwd(cwd)` to populate the discovery cache.
5. Populate in-memory `sessions` Map with `{ sessionId, cwd, role: meta.role, agent: meta.agent }`.
6. Build `configOptions` array (same structure as `newSession`) using discovery results.
7. Return `{ configOptions }`.
8. History replay is not implemented (P1 feature). No `session/update` notifications sent for history.

#### `unstable_closeSession(params: CloseSessionRequest): CloseSessionResponse`

1. Extract `sessionId` from params.
2. Look up session in in-memory state to get `cwd`.
3. Call `closeSession(cwd, sessionId)` from session store (sets `closed: true`, `closedAt`).
4. Remove from in-memory `sessions` Map.
5. Return `{}`.

#### `setSessionConfigOption(params: SetSessionConfigOptionRequest): SetSessionConfigOptionResponse`

1. Extract `sessionId`, `configId`, and `value` from params.
2. Look up session in in-memory state.
3. If `configId === "agent"`: update `session.agent` in memory, persist to `meta.json`.
4. If `configId === "role"`:
   a. Update `session.role` in memory, persist to `meta.json`.
   b. Resolve the new role via `resolveRole(value, cwd)`.
   c. Send `available_commands_update` with new role's tasks.
   d. Send `config_option_update` with updated configOptions.
5. Build complete `configOptions` array with updated `currentValue`s.
6. Return `{ configOptions }`.

### Helper: `buildConfigOptions()`

Extract the `configOptions` construction from `newSession` into a shared helper function to avoid duplication with `loadSession` and `setConfigOption`. The helper takes discovery results and current agent/role values, returns `SessionConfigOption[]`.

### Test Coverage

Tests use the same in-memory `ClientSideConnection` + `AgentSideConnection` pattern established in `session-new.test.ts`:

1. **listSessions with sessions** -- Create sessions via `newSession`, call `listSessions`, verify `SessionInfo` objects.
2. **listSessions with cwd filter** -- Create sessions for different cwds, verify filtering.
3. **listSessions empty** -- No sessions, verify empty array.
4. **loadSession restores state** -- Create session, load it, verify in-memory state.
5. **loadSession returns configOptions** -- Verify the response includes configOptions.
6. **loadSession invalid sessionId** -- Verify error on non-existent session.
7. **closeSession persists** -- Close a session, verify `meta.json` has `closed: true`.
8. **closeSession excludes from list** -- Close a session, verify it's excluded from `listSessions`.
9. **setConfigOption for agent** -- Change agent, verify state updated.
10. **setConfigOption for role** -- Change role, verify `available_commands_update` sent.
11. **setConfigOption returns configOptions** -- Verify response has full configOptions with updated values.
