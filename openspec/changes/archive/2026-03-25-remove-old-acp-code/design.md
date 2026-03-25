## Context

The `acp-refactor` PRD (REQ-013) requires removing the old Docker-bridging ACP implementation before building the new `mason acp` command. The old code spans two packages (`cli` and `mcp-agent`) and includes a session manager, SDK bridge, file logger, MCP tool matcher/rewriter, and warnings module — none of which are functional.

The primary modification target is `packages/cli/src/cli/commands/run-agent.ts`, which contains `runAgentAcpMode()` (~230 lines), ACP-specific imports, the `--acp` CLI flag registration, mode derivation logic, and help text.

## Goals / Non-Goals

**Goals:**
- Remove all old ACP source files and tests cleanly
- Remove the `--acp` CLI flag and all ACP mode branching from `run-agent.ts`
- Remove dead imports (`Readable`, `Writable` from `node:stream`, ACP types)
- Ensure zero behavioral changes to existing non-ACP modes (terminal, bash, print, dev-container, proxy-only)
- Pass TypeScript compilation, linting, and unit tests after removal

**Non-Goals:**
- Building the new `mason acp` command (CHANGE 3+)
- Removing `@agentclientprotocol/sdk` dependency (retained for new implementation)
- Modifying any agent discovery or mode validation logic beyond ACP removal

## Decisions

### 1. Delete entire directories, not individual files

The `packages/cli/src/acp/` and `packages/cli/tests/acp/` directories contain exclusively old ACP code. Delete the entire directories rather than file-by-file to ensure no orphan files remain.

### 2. Remove `createFileLogger` import but keep logger pattern

The `createFileLogger` function from `packages/cli/src/acp/logger.ts` is imported in `run-agent.ts` for both ACP mode and print mode. After removing the ACP source, this import will break. However, `runAgentPrintMode()` also uses `createFileLogger`. We need to check if print mode has its own logger or shares the ACP one — if shared, the logger function must be relocated before deletion.

**Resolution:** Inspect `runAgentPrintMode()` to confirm it imports `createFileLogger` from the same ACP logger module. If so, extract the logger to a shared location or inline it in run-agent.ts before deleting the ACP directory.

### 3. Clean removal of `effectiveAcp` mode derivation

The `createRunAction()` function computes `effectiveAcp` from `options.acp` and `configEntry?.mode === "acp"`. After removal:
- Remove the `effectiveAcp` variable entirely
- Remove the `options.acp` check in the `--bash` mutual exclusion guard
- Remove the `!options.acp` condition from `effectiveBash` derivation
- Remove the `effectiveAcp` branch in the if/else chain
- Remove `acp` from the `acpOptions` type in `runAgent()`

### 4. Remove `RunAcpAgentDeps` type alias

This is just `export type RunAcpAgentDeps = RunAgentDeps;` — a backward-compat alias that is no longer needed.

### 5. Remove ACP-related fields from `RunAgentDeps`

The `createSessionFn`, `createBridgeFn`, and `createLoggerFn` fields in `RunAgentDeps` are exclusively used by `runAgentAcpMode()`. After removing that function, these fields become dead code. Remove them.

**Caveat:** Check if `createLoggerFn` is used by `runAgentPrintMode()`. If so, keep it.

## Test Coverage

Since this change is purely deletional (no new code), the test strategy is:
1. **Existing tests pass:** `npx vitest run packages/cli/tests/` and `npx vitest run packages/mcp-agent/tests/` must pass after deletion
2. **TypeScript compiles:** `npx tsc --noEmit` must pass (no dangling imports)
3. **Linting passes:** `npx eslint src/ tests/` clean in both packages
4. **CLI flag removed:** `mason run --help` must not show `--acp`
5. **No new tests needed:** We are removing functionality, not adding it

## File-by-File Plan

| Action | File | Notes |
|--------|------|-------|
| DELETE | `packages/cli/src/acp/session.ts` | Docker session lifecycle |
| DELETE | `packages/cli/src/acp/bridge.ts` | ACP SDK bridge |
| DELETE | `packages/cli/src/acp/logger.ts` | File logger (check print mode dependency) |
| DELETE | `packages/cli/src/acp/matcher.ts` | MCP tool matching |
| DELETE | `packages/cli/src/acp/rewriter.ts` | MCP tool rewriting |
| DELETE | `packages/cli/src/acp/warnings.ts` | ACP warnings |
| DELETE | `packages/mcp-agent/src/acp-agent.ts` | Container-side ACP agent |
| DELETE | `packages/cli/tests/acp/bridge.test.ts` | Bridge tests |
| DELETE | `packages/cli/tests/acp/session.test.ts` | Session tests |
| DELETE | `packages/cli/tests/acp/matcher.test.ts` | Matcher tests |
| DELETE | `packages/cli/tests/acp/rewriter.test.ts` | Rewriter tests |
| DELETE | `packages/cli/tests/acp/warnings.test.ts` | Warnings tests |
| DELETE | `packages/mcp-agent/tests/acp-agent.test.ts` | ACP agent tests |
| MODIFY | `packages/cli/src/cli/commands/run-agent.ts` | Remove ~250 lines of ACP code |
