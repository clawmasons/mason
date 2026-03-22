## Context

The agent-config PRD (Change #2) requires a storage layer for per-agent configuration in `.mason/config.json`. Change #1 established the type foundation (`AgentConfigSchema`, `ConfigGroup`, `ConfigField`, etc.). This change builds the persistence layer that Change #3 (Config Resolution Engine) will consume.

The existing `AgentEntryConfig` interface in `packages/agent-sdk/src/discovery.ts` represents per-agent entries in the `agents` section. It currently has `package`, `home`, `mode`, `role`, `devContainerCustomizations`, and `credentials` fields. The `config` field will be added here to keep all per-agent state co-located.

The existing `readMasonConfig()` private function already reads and parses `.mason/config.json`. The new `getAgentConfig()` and `saveAgentConfig()` functions will build on this foundation.

## Goals / Non-Goals

**Goals:**
- Add `config?: Record<string, Record<string, string>>` to `AgentEntryConfig`
- Implement `getAgentConfig(projectDir, agentName)` that returns the nested config or `{}`
- Implement `saveAgentConfig(projectDir, agentName, config)` with atomic writes (temp + rename)
- Parse `config` field during `parseEntryConfig()` for round-trip fidelity
- Preserve all existing fields when writing (no data loss on save)
- Create the `.mason/` directory and config file if they don't exist
- Create the agent entry if it doesn't exist (with a sensible default `package` value)

**Non-Goals:**
- Config resolution logic (Change #3)
- Interactive prompting (Change #3)
- Populating config on agent packages (Change #4)
- Config validation or schema enforcement (runtime concern, not storage)

## Decisions

### 1. Config stored as nested `Record<string, Record<string, string>>`

The config field uses a two-level nesting: group key -> field key -> value. Example:
```json
{
  "agents": {
    "pi-coding-agent": {
      "package": "@clawmasons/pi-coding-agent",
      "config": {
        "llm": {
          "provider": "openrouter",
          "model": "anthropic/claude-sonnet-4"
        }
      }
    }
  }
}
```

This matches the `AgentConfigSchema` structure (groups contain fields) and keeps storage intuitive. The type `Record<string, Record<string, string>>` means group keys map to flat field-value objects.

**Alternative:** Flat `Record<string, string>` with dotted keys (`"llm.provider": "openrouter"`). Rejected because it's less readable in the JSON file and harder to manipulate.

### 2. Atomic writes via temp file + rename

Per PRD 10.4 (Idempotency), partial writes from Ctrl-C must be impossible. `saveAgentConfig()` will:
1. Read the current config file (or start with `{}`)
2. Deep-merge the new config into `agents.<agentName>.config`
3. Write to a temp file in the same directory (`.mason/config.json.tmp`)
4. Rename the temp file to `.mason/config.json`

Rename on the same filesystem is atomic on POSIX. On Windows, it's near-atomic (Node's `fs.renameSync` handles this).

**Alternative:** Write directly to `config.json`. Rejected because a crash mid-write would corrupt the file.

### 3. `readMasonConfig()` made accessible internally

The existing `readMasonConfig()` is private. Rather than duplicating its logic, `getAgentConfig()` and `saveAgentConfig()` will call it directly. No need to export it — both functions are in the same file.

For `saveAgentConfig()`, we also need a `writeMasonConfig()` helper that handles the atomic write pattern. This will be private as well.

### 4. `saveAgentConfig()` creates the agent entry if needed

When saving config for an agent that has no entry in `agents`, the function creates a minimal entry. The `package` field is set to the agent name (best guess — the config resolution engine will have already resolved the agent via the registry, so the entry is informational).

**Alternative:** Throw if agent entry doesn't exist. Rejected because it would require the caller to create the entry first, adding friction. The PRD envisions config being written during first-run prompting, where the agent may not yet have a config entry.

### 5. `saveAgentConfig()` deep-merges config (does not replace)

When saving `{ llm: { model: "gpt-4o" } }` to an agent that already has `{ llm: { provider: "openrouter" } }`, the result is `{ llm: { provider: "openrouter", model: "gpt-4o" } }`. This allows partial updates without losing existing values.

**Alternative:** Replace the entire config. Rejected because it would require callers to always pass the full config, which is error-prone.

### 6. `parseEntryConfig()` preserves the config field

The existing `parseEntryConfig()` function validates and normalizes agent entries. It will be updated to parse the `config` field if present, storing it on `AgentEntryConfig`. This ensures round-trip fidelity when reading entries via `loadConfigAgentEntry()`.

## Test Coverage

Tests in `packages/agent-sdk/tests/agent-config-storage.test.ts`:

- **Round-trip test:** `saveAgentConfig()` then `getAgentConfig()` returns the same values
- **Preserve existing fields:** Save config does not overwrite `package`, `credentials`, or other fields on the agent entry
- **Preserve other agents:** Save config for agent A does not affect agent B's entry
- **Deep merge:** Saving partial config merges with existing config (no data loss)
- **Create from scratch:** Save to non-existent `.mason/config.json` creates the file and directory
- **Create agent entry:** Save config for an agent not yet in `agents` creates the entry
- **Empty config read:** `getAgentConfig()` returns `{}` when agent has no config
- **Missing file read:** `getAgentConfig()` returns `{}` when config file doesn't exist
- **Missing agent read:** `getAgentConfig()` returns `{}` when agent entry doesn't exist
- **Atomic write:** Verify the temp file pattern (temp file created, then renamed)
- **parseEntryConfig round-trip:** `loadConfigAgentEntry()` returns the config field after save

## Risks / Trade-offs

- **[Package field default]** When creating a new agent entry, we use the agent name as the `package` value. This may not match the actual npm package name. Mitigation: The entry is informational for storage purposes; the registry resolves packages separately.
- **[No schema validation on read]** `getAgentConfig()` returns whatever is stored without validating against any `AgentConfigSchema`. Invalid stored values will be caught at config resolution time (Change #3), not at read time. This is intentional — the storage layer is schema-agnostic.
