## Why

Changes 1-6 of the ACP refactor implemented the full handler set individually (initialize, session/new, prompt, cancel, list, load, close, set_config_option), each with unit tests that mock dependencies. However, there is no single test that exercises the complete ACP protocol lifecycle end-to-end through in-memory streams, verifying that all handlers work together in sequence. Additionally, the old `"acp"` mode reference remains in `VALID_MODES` in the agent-sdk discovery module -- dead code from the removed Docker-bridging ACP implementation.

## What Changes

- **New test:** `packages/cli/tests/acp/acp-integration.test.ts` -- Full protocol lifecycle integration test using `ClientSideConnection` driving `AgentSideConnection` through in-memory `TransformStream` pairs. Tests the complete flow: initialize -> session/new -> prompt -> list -> close -> load -> set_config_option -> cancel. Mocks discovery and prompt execution (same as existing unit tests) but does NOT mock the agent handler layer itself.

- **Cleanup:** Remove `"acp"` from `VALID_MODES` in `packages/agent-sdk/src/discovery.ts` and update all related type annotations from `"terminal" | "acp" | "bash"` to `"terminal" | "bash"`.

## Capabilities

### New Capabilities
- `acp-integration-test`: Full protocol lifecycle test confirming all 8 ACP handlers work correctly in sequence through the SDK's connection layer.

### Modified Capabilities
- `agent-config-mode`: Remove deprecated `"acp"` mode option from agent/alias config validation.

## Impact

- **New files:** 1 test file (`acp-integration.test.ts`)
- **Modified files:** `packages/agent-sdk/src/discovery.ts` -- remove `"acp"` from `VALID_MODES` and type annotations (~5 lines changed)
- **No removed files**
- **No behavioral changes** to existing commands (mode was already deprecated)
- **Dependencies:** Same as existing ACP unit tests. No new npm dependencies.
