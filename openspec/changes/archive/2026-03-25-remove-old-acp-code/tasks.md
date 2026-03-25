## 1. Relocate File Logger

- [x] 1.1 Create `packages/cli/src/utils/file-logger.ts` with the `FileLogger` interface and `createFileLogger()` function (moved from `packages/cli/src/acp/logger.ts`, renamed from `AcpLogger` to `FileLogger`)
- [x] 1.2 Update `packages/cli/src/cli/commands/run-agent.ts` to import `createFileLogger` and `FileLogger` from the new location
- [x] 1.3 Verify `npx tsc --noEmit` passes with the relocated logger

## 2. Delete Old ACP Source Files

- [x] 2.1 Delete directory: `packages/cli/src/acp/` (session.ts, bridge.ts, logger.ts, matcher.ts, rewriter.ts, warnings.ts)
- [x] 2.2 Delete file: `packages/mcp-agent/src/acp-agent.ts`

## 3. Delete Old ACP Test Files

- [x] 3.1 Delete directory: `packages/cli/tests/acp/` (bridge.test.ts, session.test.ts, matcher.test.ts, rewriter.test.ts, warnings.test.ts)
- [x] 3.2 Delete file: `packages/mcp-agent/tests/acp-agent.test.ts`

## 4. Clean Up run-agent.ts

- [x] 4.1 Remove ACP imports: `AcpSession`, `AcpSessionConfig`, `AcpSessionDeps`, `AcpSdkBridge`, `AcpSdkBridgeConfig` from `../../acp/session.js` and `../../acp/bridge.js`
- [x] 4.2 Remove dead import: `Readable`, `Writable` from `node:stream`
- [x] 4.3 Rename `RUN_ACP_AGENT_HELP_EPILOG` to `RUN_AGENT_HELP_EPILOG`, remove ACP references from help text
- [x] 4.4 Remove `RunAcpAgentDeps` type alias
- [x] 4.5 Remove `createSessionFn`, `createBridgeFn` from `RunAgentDeps` interface (kept `createLoggerFn` — used by print mode)
- [x] 4.6 Remove `--acp` option from `registerRunCommand()` and `registerConfigureCommand()`
- [x] 4.7 Remove `acp?: boolean` from `createRunAction()` options type
- [x] 4.8 Remove `--bash and --acp are mutually exclusive` guard
- [x] 4.9 Remove `options.acp && "--acp"` from print mode conflict check
- [x] 4.10 Remove `effectiveAcp` computation and simplify `effectiveBash`
- [x] 4.11 Remove the `effectiveAcp` branch from the if/else chain in `createRunAction()`
- [x] 4.12 Remove `acp?: boolean` from `runAgent()` acpOptions parameter type
- [x] 4.13 Remove `isAcpMode` variable and the `if (isAcpMode)` branch in `runAgent()`
- [x] 4.14 Remove the entire `runAgentAcpMode()` function (~230 lines)
- [x] 4.15 Rename `AcpLogger` references to `FileLogger` throughout run-agent.ts
- [x] 4.16 Remove unused `computeToolFilters` import from `@clawmasons/shared`

## 5. Clean Up mcp-agent/src/index.ts

- [x] 5.1 Remove `createAcpAgentFactory` import (referenced deleted `acp-agent.ts`)
- [x] 5.2 Remove `Readable`, `Writable`, `AgentSideConnection`, `ndJsonStream` imports
- [x] 5.3 Remove CLI args parsing (`--acp` flag, `CliArgs` interface, `parseArgs()`)
- [x] 5.4 Remove ACP mode branch from `main()`, simplify to REPL-only
- [x] 5.5 Update module JSDoc to remove ACP references

## 6. Update Tests

- [x] 6.1 Update `packages/cli/tests/cli/cli.test.ts` — change `--acp` test to verify flag is absent
- [x] 6.2 Update `packages/cli/tests/cli/run-agent.test.ts` — change `--acp` test to verify flag is absent
- [x] 6.3 Update `packages/cli/tests/cli/run-agent.test.ts` — remove `acp: true` from Docker Compose error test

## 7. Verification

- [x] 7.1 `npx tsc --noEmit` passes
- [x] 7.2 `npx eslint src/ tests/` passes in `packages/cli/` (pre-existing non-null assertion warnings only)
- [x] 7.3 `npx vitest run packages/cli/tests/` passes (547 tests)
- [x] 7.4 `npx vitest run packages/mcp-agent/tests/` passes (38 tests)
