## Tasks

- [x] Create `packages/shared/src/role/discovery.ts` with `discoverRoles()`, `resolveRole()`, and `RoleDiscoveryError`
- [x] Export from `packages/shared/src/role/index.ts` barrel
- [x] Export from `packages/shared/src/index.ts` top-level barrel
- [x] Write tests: 21 tests covering local discovery, packaged discovery, precedence, edge cases, resolveRole
- [x] Verify: `npx tsc --noEmit` compiles
- [x] Verify: `npx vitest run` passes (1250 tests, 21 new)
- [x] Verify: `npx eslint` passes on new files
