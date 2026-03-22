## Why

The agent-config PRD (Change #2) requires per-agent configuration to persist across CLI invocations. When a user answers config prompts (e.g., LLM provider/model for Pi), those values must be stored in `.mason/config.json` so subsequent `mason run` calls skip prompting entirely. Without a storage layer, every run would re-prompt — defeating the "configure-once" goal (PRD G-2).

The existing `.mason/config.json` already has an `agents` section with per-agent entries (`AgentEntryConfig`). Rather than introducing a separate top-level `agentConfig` namespace, agent config values should nest under each agent's existing entry as a `config` field. This keeps all per-agent state co-located.

## What Changes

- Add an optional `config?: Record<string, Record<string, string>>` field to `AgentEntryConfig` in `packages/agent-sdk/src/discovery.ts`
- Implement `getAgentConfig(projectDir, agentName)` — reads `agents.<agentName>.config`, returns a nested record or empty object
- Implement `saveAgentConfig(projectDir, agentName, config)` — atomically merges the `config` field into the agent's existing entry in `.mason/config.json` (temp file + rename for crash safety per PRD 10.4). Creates the agent entry if it doesn't exist.
- Parse the `config` field during `parseEntryConfig()` for round-trip correctness
- Export both new functions from `packages/agent-sdk/src/index.ts`

## Capabilities

### New Capabilities
- `agent-config-storage`: Read and write per-agent configuration nested under `agents.<name>.config` in `.mason/config.json`, with atomic writes for crash safety

### Modified Capabilities
- `agent-entry-config`: Extended with optional `config` field for per-agent configuration storage

## Impact

- **Modified file:** `packages/agent-sdk/src/discovery.ts` — `AgentEntryConfig` extended, `getAgentConfig()` and `saveAgentConfig()` added
- **Modified file:** `packages/agent-sdk/src/index.ts` — new function exports
- **New tests:** `packages/agent-sdk/tests/agent-config-storage.test.ts` — round-trip read/write, atomic write safety, field preservation, edge cases
- **Dependencies:** No new npm dependencies. Uses `node:fs` and `node:path` (already imported).
- **Backward compatible:** The `config` field is optional. Existing config files without it continue to work unchanged.
