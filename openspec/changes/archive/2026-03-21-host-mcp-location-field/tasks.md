# Tasks: Host MCP Server Schema — `location` Field

## Implementation Tasks

- [x] Add `location` to `appConfigSchema` in `packages/shared/src/schemas/role-types.ts`
- [x] Add `location` to `ResolvedApp` in `packages/shared/src/types.ts`
- [x] Propagate `location` in `adaptApp()` in `packages/shared/src/role/adapter.ts`
- [x] Propagate `location` in `resolveApp()` in `packages/cli/src/resolver/resolve.ts`
- [x] Create `packages/shared/tests/schemas/role-types.test.ts` with location field validation tests
- [x] Update all test files constructing `ResolvedApp` objects to include `location: "proxy"`
- [x] Add role adapter tests for `location` propagation
- [x] Run `npx tsc --noEmit` — zero errors (only pre-existing unrelated error in package.test.ts)
- [x] Run `npx vitest run packages/shared/tests/` — 211 tests, all pass
- [x] Run `npx vitest run packages/cli/tests/` — 629 tests, all pass
- [x] Run `npx vitest run packages/proxy/tests/` — 351 tests, all pass
- [x] Run `npx vitest run packages/claude-code-agent/tests/` — 48 tests, all pass
- [x] Run `npx vitest run packages/pi-coding-agent/tests/` — 39 tests, all pass
- [x] Run `npx vitest run packages/mcp-agent/tests/` — 48 tests, all pass
