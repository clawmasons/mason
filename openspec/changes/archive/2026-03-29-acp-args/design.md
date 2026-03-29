## Context

The `mason acp` command currently accepts zero arguments. All configuration (agent, role) happens dynamically via ACP protocol messages (`session/new` discovery + `setSessionConfigOption`). This works for clients that support config option UIs, but most ACP clients (VS Code extensions, third-party integrations) don't implement config option selection. These clients need the values pinned at process startup.

Today's flow:
1. Client starts `mason acp` (no args)
2. `session/new` discovers roles/agents, sends them as `configOptions` in the response
3. Client renders selection UI (most don't)
4. Client calls `setSessionConfigOption` to change values (most can't)

**Key files:**
- `packages/cli/src/acp/acp-command.ts` — command registration (zero args today)
- `packages/cli/src/acp/acp-agent.ts` — ACP protocol handler, session state, config options
- `packages/cli/src/acp/prompt-executor.ts` — subprocess execution, builds `mason run` args
- `packages/cli/src/acp/discovery-cache.ts` — role/agent discovery per cwd

## Goals / Non-Goals

**Goals:**
- Allow `mason acp --agent claude --role writer --source ./path` to pin values for the connection lifetime
- Pinned values skip discovery defaults and are used directly in `mason run` subprocess calls
- Pinned config options are excluded from `configOptions` sent to the client (no point showing a selector the user already chose)
- `setSessionConfigOption` for a pinned field is rejected with a clear error

**Non-Goals:**
- Validating that pinned agent/role exist at startup (defer to `mason run` which already validates)
- Supporting `--source` as a config option in the ACP protocol (it's CLI-only)
- Changing the ACP protocol or SDK types
- Making pinned values changeable mid-connection

## Decisions

### 1. Pinned args stored as module-level state in acp-agent.ts

Pinned values are connection-scoped (one `mason acp` process = one connection). Store them as module-level variables set once from the CLI action, similar to how `storedClientCapabilities` works today.

```typescript
interface PinnedArgs {
  agent?: string;
  role?: string;
  source?: string;
}
let pinnedArgs: PinnedArgs = {};
```

**Why not per-session?** A single `mason acp` process serves one stdio connection. All sessions on that connection share the same pinned values. Per-session storage would add complexity with no benefit.

**Alternative considered:** Passing pinned args through the `AgentSideConnection` constructor or a custom init param. Rejected because the ACP SDK doesn't support custom agent factory params — module-level state is the cleanest approach given the single-connection-per-process architecture.

### 2. CLI args passed via a setter called from acp-command.ts

The command action calls a `setPinnedArgs()` function exported from `acp-agent.ts` before creating the connection. This keeps the command registration clean and avoids threading args through the SDK's connection/agent factory.

```typescript
// acp-command.ts
.option("--agent <name>", "Pin agent for all sessions")
.option("--role <name>", "Pin role for all sessions")
.option("--source <path>", "Pin source directory for all sessions")
.action(async (opts) => {
  setPinnedArgs({ agent: opts.agent, role: opts.role, source: opts.source });
  // ... existing stdio setup ...
});
```

### 3. buildConfigOptions filters out pinned fields

Modify `buildConfigOptions` to accept `pinnedArgs` and exclude options that are pinned. When `--agent` is pinned, the "agent" config option is omitted from the array. Same for `--role`.

This is the minimal change — the function already builds the full list, we just filter it.

### 4. newSession and loadSession use pinned values as overrides

In `newSession`, if `pinnedArgs.agent` is set, use it instead of `discovery.defaultAgent`. Same for role. The discovery still runs (we need the full role list for validation context), but the defaults are overridden.

In `loadSession`, pinned values override the stored session's agent/role (the session was created with pinned values, but this ensures consistency even if meta.json was manually edited).

### 5. setSessionConfigOption rejects pinned fields

If a client tries to change a pinned config option, return a `RequestError.invalidParams` with a message like `"agent is pinned via CLI argument and cannot be changed"`. This is explicit and debuggable.

**Alternative considered:** Silently ignoring the request. Rejected because silent failures are harder to debug for client developers.

### 6. --source passed through to mason run subprocess args

The `--source` flag is forwarded to `mason run` as `--source <path>`. This is added to the args array in `executePromptStreaming` (and `executePrompt`). It's not a config option — it's only a CLI pass-through.

The prompt executor options interface gains an optional `source?: string` field, and the session state gains the same.

## Risks / Trade-offs

**[Risk] Pinned role/agent doesn't exist in the project** → Discovery still runs; `mason run` will fail with a clear error at prompt time. This is acceptable — failing at prompt time gives the same error the user would get from `mason run` directly. Startup validation would require running discovery before we have a `cwd` (which comes from `session/new`).

**[Risk] Source path is relative and cwd varies per session** → Resolve `--source` relative to `process.cwd()` at startup in `acp-command.ts`, store as absolute path. Each session may have a different `cwd` but the source path was specified relative to where `mason acp` was launched.

**[Trade-off] Module-level state vs. dependency injection** → Module-level state is simpler but harder to test in isolation. Mitigated by the existing `clearSessionStates()` test helper pattern — add a `clearPinnedArgs()` for tests.
