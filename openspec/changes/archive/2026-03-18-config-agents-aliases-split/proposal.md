## Why

The `agents` section in `.mason/config.json` currently conflates two separate concerns: declaring which agent packages are available (a registry concern) and configuring how they run (a runtime concern). This makes it awkward to reuse the same agent with different runtime configurations, and muddles what `--agent <name>` actually resolves to. Separating these into `agents` (registry) and `aliases` (presets) gives each a clear single responsibility.

## What Changes

- **`agents`** section is narrowed to a pure name→package registry — only the `package` field is valid here. This is what `--agent <name>` resolves against.
- **`aliases`** section is introduced as a new top-level key. An alias is a named, runnable preset: it references an agent name and carries all runtime configuration (`mode`, `role`, `home`, `credentials`, `devContainerCustomizations`, `agent-args`).
- `mason {alias}` runs an alias directly, equivalent to `mason --agent <agent> --mode <mode> --role <role> ...` today.
- **BREAKING**: Runtime fields (`mode`, `role`, `home`, `credentials`, `devContainerCustomizations`) are no longer valid inside `agents` entries — they must move to `aliases`.
- Existing configs with runtime fields in `agents` should emit a deprecation warning (with a migration hint) during the transition period.

### Field ownership after the split

| Field | `agents` | `aliases` |
|---|---|---|
| `package` | ✅ | ❌ |
| `agent` (ref to agents key) | ❌ | ✅ |
| `mode` | ❌ | ✅ |
| `role` | ❌ | ✅ |
| `home` | ❌ | ✅ |
| `credentials` | ❌ | ✅ |
| `devContainerCustomizations` | ❌ | ✅ |
| `agent-args` (extra CLI args passed to the agent) | ❌ | ✅ |

### Example config after migration

```json
{
  "agents": {
    "claude": { "package": "@clawmasons/claude-code" },
    "mcp":    { "package": "@clawmasons/mcp-agent" }
  },
  "aliases": {
    "frontend": {
      "agent": "claude",
      "mode": "terminal",
      "role": "frontend-dev",
      "home": "~/projects/frontend"
    },
    "api-review": {
      "agent": "claude",
      "mode": "acp",
      "role": "backend-reviewer",
      "agent-args": ["--verbose", "--max-turns", "10"]
    }
  }
}
```

## Capabilities

### New Capabilities
- `config-aliases`: New `aliases` section in `.mason/config.json` — schema, loading, validation, and `mason {alias}` dispatch

### Modified Capabilities
- `agent-config-extended-properties`: Runtime fields (`mode`, `role`, `home`, `credentials`, `devContainerCustomizations`) move out of the `agents` entry schema; `agents` entries are narrowed to `{ package }` only

## Impact

- `packages/agent-sdk/src/discovery.ts` — `AgentEntryConfig` interface narrowed; alias loading logic added
- `packages/agent-sdk/src/types.ts` — new `AliasEntryConfig` type introduced
- `packages/cli/src/cli/commands/run-agent.ts` — alias resolution before agent dispatch
- `.mason/config.json` in any project using runtime fields in `agents` — **migration required**
- `openspec/specs/agent-config-extended-properties/spec.md` — requirements updated to reflect narrowed agents schema
