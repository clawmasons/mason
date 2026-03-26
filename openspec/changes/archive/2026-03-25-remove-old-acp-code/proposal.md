## Why

The current ACP (Agent Communication Protocol) implementation is a non-functional Docker-bridging architecture that was never completed. It adds maintenance burden, import confusion, and dead code paths. The new ACP implementation (PRD `acp-refactor`) will use `@agentclientprotocol/sdk` directly via a `mason acp` command. Before building the new implementation, the old dead code must be removed to create a clean slate.

## What Changes

- Delete the entire `packages/cli/src/acp/` directory (session.ts, bridge.ts, logger.ts, matcher.ts, rewriter.ts, warnings.ts)
- Delete `packages/mcp-agent/src/acp-agent.ts` (container-side ACP agent)
- Delete all associated test files in `packages/cli/tests/acp/` and `packages/mcp-agent/tests/acp-agent.test.ts`
- Remove `runAgentAcpMode()` function (~200 lines) from `packages/cli/src/cli/commands/run-agent.ts`
- Remove the `--acp` CLI option from `mason run` and `mason configure` command registrations
- Remove ACP-related imports (`AcpSession`, `AcpSdkBridge`, `createFileLogger`, `Readable`, `Writable`) and dead code paths
- Remove `RUN_ACP_AGENT_HELP_EPILOG` help text and `RunAcpAgentDeps` type alias
- Clean up `effectiveAcp` mode derivation and `isAcpMode` branching in `runAgent()`

## Capabilities

### Modified Capabilities
- `run-command`: The `--acp` flag is removed from `mason run` and `mason configure`. The `runAgent()` function no longer has an ACP mode branch.

### Removed Capabilities
- `acp-session`: The Docker-bridging ACP session lifecycle is removed entirely
- `acp-proxy-cli-command`: The ACP SDK bridge is removed entirely

## Impact

- **Deleted files:** 8 source files, 6 test files
- **Modified files:** `packages/cli/src/cli/commands/run-agent.ts` — significant reduction (~250 lines removed)
- **No new dependencies**
- **No behavioral changes** to non-ACP modes (terminal, bash, print, dev-container, proxy-only)
- **The `@agentclientprotocol/sdk` dependency is retained** — it will be used by the new implementation in subsequent changes
