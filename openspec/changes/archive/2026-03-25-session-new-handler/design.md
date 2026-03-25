## Context

This is Change 4 of the `acp-refactor` PRD. Changes 1-3 have been merged: old ACP code removed, session storage module created, and `mason acp` command with `initialize` handler implemented. This change implements the `session/new` handler — the first handler that creates actual sessions and integrates with mason's discovery infrastructure.

The existing codebase provides:
- `discoverRoles(cwd)` from `packages/shared/src/role/discovery.ts` — finds local + packaged roles
- `createAgentRegistry(builtinAgents, cwd)` from `packages/agent-sdk/src/discovery.ts` — builds agent registry
- `getRegisteredAgentNames(registry)` — extracts unique agent names from registry
- `inferAgentType(role, defaultAgent)` from `packages/cli/src/cli/commands/run-agent.ts` — determines agent from role dialect
- `readDefaultAgent(cwd)` from `packages/agent-sdk/src/discovery.ts` — reads `defaultAgent` from config
- `createSession(cwd, agent, role)` from `packages/shared/src/session/session-store.ts` — persists session metadata
- `BUILTIN_AGENTS` from `packages/cli/src/materializer/role-materializer.ts` — the built-in mcpAgent

## Goals / Non-Goals

**Goals:**
- Implement `newSession` handler that accepts `cwd` and creates a session
- Discover roles and agents using existing shared functions (no duplication)
- Return `configOptions` with `role` (category: "role") and `agent` (category: "model") select options
- Send `available_commands_update` notification with the default role's tasks
- Cache discovery results per `cwd` to avoid redundant filesystem scans
- Create default project role when no non-packaged roles exist
- Persist session via `createSession()` from the session store

**Non-Goals:**
- Implementing `session/prompt`, `session/load`, or other handlers (Changes 5-6)
- Agent auto-install during discovery (uses what's available in registry)
- MCP server forwarding from `mcpServers` param (future enhancement)

## Decisions

### 1. Discovery cache design

Discovery results (roles array, agent registry) are cached per `cwd` in a simple `Map<string, DiscoveryResult>`. The cache is module-level and shared across all sessions. Cache entries are never auto-expired — they persist for the lifetime of the `mason acp` process. This is acceptable because:
- The ACP process is per-editor window, so cwd doesn't change frequently
- Role/agent changes require restarting the ACP server anyway
- `setConfigOption` can invalidate the cache when needed (Change 6)

```typescript
interface DiscoveryResult {
  roles: Role[];
  registry: AgentRegistry;
  agentNames: string[];
  defaultRole: Role;
  defaultAgent: string;
}
```

### 2. Default role creation

If `discoverRoles(cwd)` returns no non-packaged (local) roles, we create a minimal `{cwd}/.mason/roles/project/ROLE.md` with:
```markdown
---
name: project
---
Default project role.
```
Then re-run discovery to pick it up. This aligns with REQ-003.

### 3. Session state management

In addition to on-disk `meta.json` (from the session store), we maintain an in-memory `Map<string, SessionState>` keyed by `sessionId`. This holds runtime state that doesn't need persistence:

```typescript
interface SessionState {
  sessionId: string;
  cwd: string;
  role: string;
  agent: string;
  abortController?: AbortController;  // for future cancel support
}
```

This map lives in `acp-agent.ts` and is shared across handler closures via the factory pattern.

### 4. configOptions structure

Per the ACP SDK types, `configOptions` is an array of `SessionConfigOption`:

```typescript
configOptions: [
  {
    id: "role",
    name: "Role",
    type: "select",
    category: "role",
    currentValue: defaultRole.metadata.name,
    options: roles.map(r => ({
      value: r.metadata.name,
      name: r.metadata.name,
      description: r.source.type === "package" ? `(packaged: ${r.source.packageName})` : "(local)",
    })),
  },
  {
    id: "agent",
    name: "Agent",
    type: "select",
    category: "model",
    currentValue: defaultAgent,
    options: agentNames.map(name => ({
      value: name,
      name,
    })),
  },
]
```

### 5. available_commands_update

After returning the `NewSessionResponse`, send a `sessionUpdate` notification:

```typescript
conn.sessionUpdate({
  sessionId,
  update: {
    sessionUpdate: "available_commands_update",
    availableCommands: role.tasks.map(task => ({
      name: task.name,
      description: task.ref ?? task.name,
      input: { hint: "command arguments" },
    })),
  },
});
```

### 6. Connection reference in agent factory

The `createMasonAcpAgent(conn)` factory already receives the connection. We'll use `conn.sessionUpdate()` for notifications. The `void conn` placeholder from Change 3 will be replaced with actual usage.

## File Changes

### `packages/cli/src/acp/discovery-cache.ts` (new)

Exports:
- `discoverForCwd(cwd: string): Promise<DiscoveryResult>` — cached discovery
- `invalidateCache(cwd: string): void` — for future use by `setConfigOption`
- `DiscoveryResult` type

### `packages/cli/src/acp/acp-agent.ts` (modify)

- Add imports for discovery, session store, and new types
- Replace `void conn` with actual connection usage
- Add in-memory `sessions` Map
- Implement `newSession` handler body
- Add `listSessions`, `loadSession`, `closeSession`, `setConfigOption` to the Agent return (as stubs — they exist as optional methods)

### `packages/cli/tests/acp/session-new.test.ts` (new)

Test coverage:
1. `session/new` creates a session with valid UUID
2. `configOptions` contain role select with correct structure
3. `configOptions` contain agent select with correct structure
4. `available_commands_update` is sent with role tasks
5. `meta.json` is written to `{cwd}/.mason/sessions/{id}/`
6. Discovery is called with the correct `cwd`
7. Default project role is created when no local roles exist
8. Discovery cache returns same results on second call

Tests use mocked discovery functions (vi.mock) to avoid real filesystem operations and agent package imports. The session store operations are tested against a real temp directory (they're already well-tested in Change 2, but we verify integration).
