## Why

After implementing `session/new`, `session/prompt`, and `session/cancel` (Changes 3-5), the ACP agent can create sessions and process prompts, but the remaining lifecycle handlers (`listSessions`, `loadSession`, `closeSession`, `setConfigOption`) are stubs. Editor extensions cannot browse existing sessions, resume previous work, close sessions, or switch agents/roles mid-session. This change completes the ACP handler set.

## What Changes

- **Modify:** `packages/cli/src/acp/acp-agent.ts` -- Replace the stub/missing lifecycle handlers with real implementations:
  - `listSessions`: Delegates to the session store's `listSessions(cwd)`, maps results to ACP `SessionInfo[]`, returns `{ sessions, nextCursor: null }`.
  - `loadSession`: Reads `meta.json` to restore agent/role, populates in-memory `sessions` Map, runs discovery for the cwd, returns `LoadSessionResponse` with `configOptions`. History replay deferred to P1.
  - `unstable_closeSession`: Delegates to session store's `closeSession()`, removes from in-memory state, returns `{}`.
  - `setSessionConfigOption`: Updates agent or role in memory and `meta.json`. If role changes, re-resolves via `resolveRole()`, sends `available_commands_update` and `config_option_update` notifications. Returns complete `configOptions` array.

- **New test:** `packages/cli/tests/acp/session-lifecycle.test.ts` -- Unit tests verifying:
  - `listSessions` returns correct `SessionInfo` objects and respects `cwd` filter
  - `loadSession` restores in-memory state from `meta.json`
  - `closeSession` persists `closed: true` and excludes from subsequent list
  - `setConfigOption` for agent updates state
  - `setConfigOption` for role triggers `available_commands_update` notification

## Capabilities

### New Capabilities
- `acp-list-sessions`: List existing sessions with optional cwd filtering via `session/list`.
- `acp-load-session`: Resume a previous session from persisted state via `session/load`.
- `acp-close-session`: Close a session and free resources via `session/close` (unstable).
- `acp-set-config-option`: Change agent or role mid-session via `session/set_config_option`.

## Impact

- **New files:** 1 test file (`session-lifecycle.test.ts`)
- **Modified files:** `packages/cli/src/acp/acp-agent.ts` -- lifecycle handler implementations (~120 lines added, stubs replaced)
- **No removed files**
- **No behavioral changes** to existing commands
- **Dependencies:** Uses existing `resolveRole` from `@clawmasons/shared`, existing session store functions, existing discovery cache. No new npm dependencies.
