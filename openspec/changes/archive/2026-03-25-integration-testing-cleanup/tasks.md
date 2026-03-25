## Tasks

- [x] Remove `"acp"` from `VALID_MODES` in `packages/agent-sdk/src/discovery.ts`
- [x] Update `AgentEntryConfig.mode` type from `"terminal" | "acp" | "bash"` to `"terminal" | "bash"`
- [x] Update `AliasEntryConfig.mode` type from `"terminal" | "acp" | "bash"` to `"terminal" | "bash"`
- [x] Update all mode cast expressions and warning messages in `discovery.ts`
- [x] Create `packages/cli/tests/acp/acp-integration.test.ts` with full lifecycle test
- [x] Test scenario 1: `initialize` returns correct capabilities
- [x] Test scenario 2: `session/new` returns sessionId + configOptions + available_commands_update
- [x] Test scenario 3: `session/prompt` returns end_turn + agent_message_chunk + session_info_update
- [x] Test scenario 4: `session/list` returns created sessions
- [x] Test scenario 5: `session/close` marks session closed, excluded from list
- [x] Test scenario 6: `session/load` restores session state
- [x] Test scenario 7: `session/set_config_option` triggers available_commands_update
- [x] Test scenario 8: `session/cancel` during prompt returns cancelled
- [x] Verify TypeScript compiles (`npx tsc --noEmit`)
- [x] Verify linting passes (`npx eslint src/ tests/` in packages/cli and packages/agent-sdk)
- [x] Verify unit tests pass (`npx vitest run packages/cli/tests/`)
- [x] Verify agent-sdk tests pass (`npx vitest run packages/agent-sdk/tests/`)
