# Tasks: Dynamic Dialect Self-Registration

**Spec:** dynamic-dialect-registration
**Date:** 2026-03-22

---

## Implementation Tasks

- [x] **T1: Add `dialectFields` to AgentPackage interface**
  - File: `packages/agent-sdk/src/types.ts`
  - Add optional `dialectFields?: { tasks?: string; apps?: string; skills?: string }` to `AgentPackage`

- [x] **T2: Add `registerAgentDialect()` to dialect-registry.ts**
  - File: `packages/shared/src/role/dialect-registry.ts`
  - Add `AgentDialectInfo` interface and `registerAgentDialect()` function
  - Function derives `DialectEntry` from agent info and calls `registerDialect()`

- [x] **T3: Export new function from shared package**
  - File: `packages/shared/src/role/index.ts`
  - File: `packages/shared/src/index.ts`
  - Export `registerAgentDialect` and `AgentDialectInfo` type

- [x] **T4: Remove hardcoded agent-specific dialect entries**
  - File: `packages/shared/src/role/dialect-registry.ts`
  - Removed static `registerDialect()` calls for: claude-code-agent, mcp-agent, pi-coding-agent (both copies)
  - Kept: mason, codex, aider

- [x] **T5: Add `dialect` and `dialectFields` to agent packages**
  - File: `packages/claude-code-agent/src/index.ts` — Added `dialect: "claude"`, `dialectFields: { tasks: "commands" }`
  - File: `packages/pi-coding-agent/src/index.ts` — Added `dialect: "pi"`, `dialectFields: { tasks: "prompts" }`
  - File: `packages/mcp-agent/src/agent-package.ts` — Added `dialect: "mcp"`, `dialectFields: { tasks: "commands" }`

- [x] **T6: Wire dynamic registration into initRegistry() and getRegistry()**
  - File: `packages/cli/src/materializer/role-materializer.ts`
  - In `initRegistry()`: after `createAgentRegistry()`, loops agents and calls `registerAgentDialect()` for those with `dialect`
  - In `getRegistry()`: also registers dialects for BUILTIN_AGENTS with `dialect` field (sync path)

- [x] **T7: Update and add unit tests**
  - File: `packages/shared/tests/dialect-registry.test.ts` — Added tests for `registerAgentDialect()` (basic, custom fields, configs, idempotency)
  - File: `packages/shared/tests/setup-dialects.ts` — Vitest setup file to register agent dialects before tests
  - Updated `vitest.config.ts` to use setup file

- [x] **T8: Verify build and all tests pass**
  - `npx tsc --noEmit` — clean
  - `npx vitest run packages/shared/tests/` — 246 passed (11 files)
  - `npx vitest run packages/cli/tests/` — 695 passed (37 files)
  - `npx vitest run packages/agent-sdk/tests/` — 168 passed (5 files)
  - Total: 1109 tests passing across 53 files

## Verification Checklist

- [x] `getAllDialects()` returns same dialects as before (mason, codex, aider, claude-code-agent, mcp-agent, pi-coding-agent)
- [x] `resolveDialectName("claude")` returns `"claude-code-agent"`
- [x] `resolveDialectName("pi")` returns `"pi-coding-agent"`
- [x] `resolveDialectName("mcp")` returns `"mcp-agent"`
- [x] No duplicate pi-coding-agent registration
- [x] TypeScript compiles without errors
- [x] All shared, cli, and agent-sdk tests pass
