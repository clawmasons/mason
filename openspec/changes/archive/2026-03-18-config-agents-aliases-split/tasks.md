## 1. Types

- [x] 1.1 Narrow `AgentEntryConfig` in `packages/agent-sdk/src/types.ts` to only `{ package: string }`
- [x] 1.2 Add `AliasEntryConfig` interface with `agent`, `mode`, `role`, `home`, `credentials`, `devContainerCustomizations`, `agent-args` fields
- [x] 1.3 Add `aliases` key to the top-level config type (`MasonConfig` or equivalent)

## 2. Config Loading

- [x] 2.1 Update `packages/agent-sdk/src/discovery.ts` to load and validate the `aliases` section
- [x] 2.2 Emit deprecation warning when runtime fields (`mode`, `role`, `home`, `credentials`, `devContainerCustomizations`) are found in an `agents` entry
- [x] 2.3 Validate that each alias's `agent` field references a known key in `agents`; error and exit if not
- [x] 2.4 Validate `mode` in alias entries; warn and default to `"terminal"` on invalid values
- [x] 2.5 Warn when an alias name collides with an agent name

## 3. Dispatch

- [x] 3.1 Update `packages/cli/src/cli/commands/run-agent.ts` to resolve alias names before agent names
- [x] 3.2 When dispatching an alias, merge alias runtime config with CLI flags (CLI flags take precedence)
- [x] 3.3 Append `agent-args` to the agent invocation args after all mason-resolved args

## 4. Tests

- [x] 4.1 Unit test: valid aliases section parses correctly
- [x] 4.2 Unit test: alias with only `agent` field (all optional fields undefined)
- [x] 4.3 Unit test: alias referencing unknown agent emits error and exits
- [x] 4.4 Unit test: `mason {alias}` dispatches with correct runtime config
- [x] 4.5 Unit test: CLI flags override alias runtime config
- [x] 4.6 Unit test: alias name takes precedence over agent name on collision
- [x] 4.7 Unit test: `agent-args` appended after resolved args
- [x] 4.8 Unit test: runtime fields in `agents` entry emit deprecation warning
- [x] 4.9 Unit test: invalid mode in alias defaults to terminal with warning

## 5. Verification

- [x] 5.1 Run `npx tsc --noEmit` — no type errors
- [x] 5.2 Run `npx eslint src/ tests/` — no lint errors
- [x] 5.3 Run `npx vitest run` — all unit tests pass
- [x] 5.4 Update `.mason/config.json` in the repo (if it has runtime fields in `agents`) to use the new `aliases` format
