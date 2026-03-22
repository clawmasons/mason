## Why

When a user runs `mason run pi` for the first time, the Pi agent fails with a hard error because `agent.llm` is undefined. Changes #1 and #2 established the type foundation (`AgentConfigSchema`, `ConfigField`, etc.) and the storage layer (`getAgentConfig`/`saveAgentConfig`). But there is no runtime logic that connects the two: nothing reads the schema, determines which fields are missing, prompts the user, or persists the answers.

Without a config resolution engine, the config schema types are inert declarations and the storage layer is never written to. This change bridges the gap — it is the core runtime that makes the agent-config framework functional.

## What Changes

- New file `packages/cli/src/config/resolve-config.ts` — Pure function `resolveConfig(schema, storedConfig)` that walks each group/field in declaration order, checks stored values, and returns `{ resolved, missing }`. No side effects, no I/O.
- New file `packages/cli/src/config/prompt-config.ts` — Interactive prompting wrapper that calls `resolveConfig`, prompts for missing fields via an injectable `PromptFn`, and returns the fully resolved config. Handles both select-list and free-text input. In non-interactive mode (no TTY), returns a structured error listing all missing fields.
- Wire into `createRunAction()` in `packages/cli/src/cli/commands/run-agent.ts` — After agent type resolution but before materialization: load stored config, run resolution, persist newly prompted values via `saveAgentConfig`, then set `agent.llm` from resolved config values.

## Capabilities

### New Capabilities
- `config-resolution`: Pure function that resolves an `AgentConfigSchema` against stored config, identifying missing fields and collecting resolved values
- `config-prompting`: Interactive TTY prompting for missing config fields with select-list and free-text support, plus non-interactive error reporting

### Modified Capabilities
- `run-agent`: Wired to run config resolution after agent type resolution, persisting answers and populating `ResolvedAgent.llm` before materialization

## Impact

- **New file:** `packages/cli/src/config/resolve-config.ts` — Pure resolution logic
- **New file:** `packages/cli/src/config/prompt-config.ts` — Interactive prompting wrapper
- **Modified file:** `packages/cli/src/cli/commands/run-agent.ts` — Config resolution wiring in `createRunAction()`
- **New tests:** `packages/cli/tests/config/resolve-config.test.ts` — Pure function tests
- **New tests:** `packages/cli/tests/config/prompt-config.test.ts` — Prompting tests with injectable mock
- **Dependencies:** No new npm dependencies. Uses `node:readline` (already used in the codebase).
- **Backward compatible:** Agents without `configSchema` are unaffected — resolution is a no-op when schema is absent.
