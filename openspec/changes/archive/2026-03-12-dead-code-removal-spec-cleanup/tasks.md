# Tasks: Dead Code Removal and Spec Cleanup

## Phase 1: Schema Removal
- [x] Delete `packages/shared/src/schemas/agent.ts`
- [x] Remove `agent` from `chapter-field.ts` (enum, union type, imports, schemasByType)
- [x] Remove agent exports from `packages/shared/src/schemas/index.ts`
- [x] Remove agent exports from `packages/shared/src/index.ts`

## Phase 2: Resolver Cleanup
- [x] Remove `resolveAgent` function from `packages/cli/src/resolver/resolve.ts`
- [x] Remove `resolveAgent` export from `packages/cli/src/resolver/index.ts`
- [x] Remove agent exports from `packages/cli/src/index.ts`

## Phase 3: CLI Command Updates
- [x] Update `build.ts` — use `discoverRoles` instead of agent package scanning
- [x] Update `proxy.ts` — use `resolveRolePackage` instead of agent auto-detect
- [x] Update `run-agent.ts` — deprecate `resolveAgentName`, add `defaultResolveAgentFromRole`, update ACP mode
- [x] Update `docker-init.ts` — scan for role packages, build ResolvedAgent wrappers
- [x] Update `init-role.ts` — replace `resolveAgentsForRole` with `resolveRoleForInit`
- [x] Update `validate.ts` — remove agent fallback, use role-based validation
- [x] Update `permissions.ts` — use `resolveRole` + `adaptRoleToResolvedAgent`
- [x] Update `remove.ts` — remove `type === "agent"` check block

## Phase 4: Test Updates
- [x] Delete `tests/schemas/member.test.ts`
- [x] Update `tests/schemas/chapter-field.test.ts` — agent type rejected
- [x] Update `tests/resolver/resolve.test.ts` — test `resolveRolePackage` and agent type rejection
- [x] Update all affected CLI test files (build, docker-init, permissions, proxy, init-role, run-acp-agent, run-agent, cli, validate, remove, discover)

## Phase 5: Spec File Updates
- [ ] Deferred — historical specs retain original terminology

## Phase 6: Verification
- [x] `npx tsc --noEmit` compiles (0 errors)
- [x] `npx eslint src/ tests/` passes on changed files
- [x] `npx vitest run` passes (69 files, 1330 tests)
- [x] No references to `chapter.type = "agent"` in schemas or production code
