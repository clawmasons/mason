# Tasks: Remove Legacy Hardcoded References

**Spec:** remove-legacy-hardcoded
**PRD:** agent-config — Change #7
**Date:** 2026-03-22
**Status:** Complete

---

## Implementation Tasks

### T1: Add `readDefaultAgent()` to agent-sdk
- [x] Add optional `defaultAgent?: string` to `MasonConfig` interface in `packages/agent-sdk/src/discovery.ts`
- [x] Add `readDefaultAgent(projectDir: string): string | undefined` function
- [x] Export `readDefaultAgent` from `packages/agent-sdk/src/index.ts`

### T2: Add `getAllRegisteredNames()` to role-materializer
- [x] Add `getAllRegisteredNames(): string[]` export to `packages/cli/src/materializer/role-materializer.ts` that returns all keys from the registry

### T3: Remove `AGENT_TYPE_ALIASES` and simplify `resolveAgentType()`
- [x] Delete `AGENT_TYPE_ALIASES` constant from `run-agent.ts`
- [x] Simplify `resolveAgentType()` to only check agent registry
- [x] Update `getKnownAgentTypeNames()` to use `getAllRegisteredNames()` from role-materializer

### T4: Update `inferAgentType()` for configurable default
- [x] Add optional `defaultAgent` parameter to `inferAgentType()`
- [x] Update all call sites in `run-agent.ts` (4 sites) and `build.ts` (2 sites) to pass `defaultAgent` from config

### T5: Derive `DEFAULT_MASON_CONFIG` from `BUILTIN_AGENTS`
- [x] Replace hardcoded `DEFAULT_MASON_CONFIG` constant with `buildDefaultMasonConfig()` function
- [x] Export `BUILTIN_AGENTS` from `role-materializer.ts`
- [x] Use first alias as config key, `@clawmasons/<name>` as package name

### T6: Update tests
- [x] `resolveAgentType` tests: no changes needed (existing tests use registry aliases, not legacy map)
- [x] `getKnownAgentTypeNames` tests: no changes needed (tests check registry names)
- [x] Update `ensureMasonConfig` tests: verify derived config from BUILTIN_AGENTS (pi -> pi-coding-agent)
- [x] Update `commands-index.test.ts`: replace "codex" expectation with "pi" in error output
- [x] Add `inferAgentType` test suite with configurable default (5 tests)
- [x] Add `buildDefaultMasonConfig` test suite (2 tests)
- [x] Verify `normalizeSourceFlags` tests still pass (use dialect registry, not alias map)

### T7: Compile and lint
- [x] `npx tsc --noEmit` passes
- [x] `npx eslint packages/cli/src/ packages/agent-sdk/src/` passes

### T8: Run tests
- [x] `npx vitest run packages/cli/tests/` — 706 passed (37 files)
- [x] `npx vitest run packages/agent-sdk/tests/` — 168 passed (5 files)
- [x] `npx vitest run packages/shared/tests/` — 246 passed (11 files)
