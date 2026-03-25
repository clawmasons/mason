## Why

After establishing the `mason acp` CLI command and `initialize` handler (Change 3), the next step is to implement `session/new` — the handler that creates a session when an editor extension opens a project. This is the critical handler that connects the ACP protocol to mason's existing role and agent discovery infrastructure, letting editors present dropdown options for roles and agents, and receive slash commands from the active role.

Without this, the ACP agent can negotiate capabilities but cannot create sessions or do any useful work.

## What Changes

- Modify: `packages/cli/src/acp/acp-agent.ts` — implement the `newSession` handler that:
  1. Receives `cwd` from the client
  2. Discovers roles via `discoverRoles(cwd)` and agents via `createAgentRegistry(builtinAgents, cwd)`
  3. Creates a default project role if no non-packaged roles exist
  4. Creates a session via `createSession(cwd, agent, role)` from the session store
  5. Returns `NewSessionResponse` with `sessionId` and `configOptions` (role + agent selects)
  6. Sends `available_commands_update` notification with the role's tasks

- New file: `packages/cli/src/acp/discovery-cache.ts` — per-cwd cache for discovery results (roles, agents, registry) so that subsequent `session/new` calls for the same directory reuse cached data.

- New test: `packages/cli/tests/acp/session-new.test.ts` — unit tests with mocked discovery verifying session creation, configOptions structure, available_commands_update notifications, and meta.json persistence.

## Capabilities

### New Capabilities
- `acp-session-new`: The `session/new` handler creates sessions with role/agent discovery, returning configOptions and sending available_commands_update notifications.
- `acp-discovery-cache`: Per-cwd cache avoids redundant role/agent discovery on repeated session creation.

## Impact

- **New files:** 1 source file (`discovery-cache.ts`), 1 test file (`session-new.test.ts`)
- **Modified files:** `packages/cli/src/acp/acp-agent.ts` — implement `newSession` handler (~80 lines)
- **No removed files**
- **No behavioral changes** to existing commands
- Reuses existing `discoverRoles()`, `createAgentRegistry()`, `inferAgentType()`, and `createSession()` — no duplication
