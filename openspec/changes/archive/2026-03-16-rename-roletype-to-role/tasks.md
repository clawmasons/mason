## 1. Rename Type Definition, Schema, and Exports

- [x] 1.1 In `packages/shared/src/types/role-types.ts`, rename `export type RoleType` to `export type Role`
- [x] 1.2 In `packages/shared/src/schemas/role-types.ts`, rename `roleTypeSchema` to `roleSchema` (variable and export)
- [x] 1.3 In `packages/shared/src/index.ts`, update exports: `RoleType` → `Role`, `roleTypeSchema` → `roleSchema`

## 2. Rename Files

- [x] 2.1 Rename `packages/shared/src/types/role-types.ts` → `role.ts` and update any internal imports
- [x] 2.2 Rename `packages/shared/src/schemas/role-types.ts` → `role.ts` and update any internal imports
      NOTE: `schemas/role.ts` already existed (chapter field schema) — kept filename as `role-types.ts`, only renamed the exported symbol
- [x] 2.3 Update `packages/shared/src/schemas/index.ts` import path from `./role-types` → `./role`
      NOTE: Import kept as `./role-types.js` due to naming conflict (see 2.2)
- [x] 2.4 Rename `packages/shared/tests/role-types.test.ts` → `role.test.ts` and update import path inside the file
- [x] 2.5 Rename spec folder: `git mv openspec/specs/role-types-core-type-system openspec/specs/role-core-type-system`

## 3. Update packages/shared Source

- [x] 3.1 Update `packages/shared/src/types/role.ts` (renamed) — fix import path to schema if needed
- [x] 3.2 Update `packages/shared/src/role/adapter.ts` — rename all `RoleType` usages and update import path
- [x] 3.3 Update `packages/shared/src/role/discovery.ts` — rename all `RoleType` usages and update import path
- [x] 3.4 Update `packages/shared/src/role/package-reader.ts` — rename all `RoleType`/`roleTypeSchema` usages and update import path
- [x] 3.5 Update `packages/shared/src/role/parser.ts` — rename all `RoleType`/`roleTypeSchema` usages and update import path

## 4. Update packages/cli Source

- [x] 4.1 Update `packages/cli/src/cli/commands/run-agent.ts` — rename all `RoleType` imports and usages
- [x] 4.2 Update `packages/cli/src/cli/commands/build.ts` — rename all `RoleType` imports and usages
- [x] 4.3 Update `packages/cli/src/cli/commands/list.ts` — rename all `RoleType` imports and usages
- [x] 4.4 Update `packages/cli/src/cli/commands/package.ts` — rename all `RoleType` imports and usages
- [x] 4.5 Update `packages/cli/src/materializer/role-materializer.ts` — rename all `RoleType` imports and usages
- [x] 4.6 Update `packages/cli/src/materializer/docker-generator.ts` — rename all `RoleType` imports and usages
- [x] 4.7 Update `packages/cli/src/materializer/proxy-dependencies.ts` — rename all `RoleType` imports and usages

## 5. Update Tests

- [x] 5.1 Update `packages/shared/tests/role.test.ts` (renamed) — rename all `RoleType`/`roleTypeSchema` usages
- [x] 5.2 Update `packages/shared/tests/role-adapter.test.ts` — rename all `RoleType` usages
- [x] 5.3 Update `packages/cli/tests/cli/run-agent.test.ts` — rename all `RoleType` usages
- [x] 5.4 Update `packages/cli/tests/materializer/docker-generator.test.ts` — rename all `RoleType` usages
- [x] 5.5 Update `packages/cli/tests/materializer/role-materializer.test.ts` — rename all `RoleType` usages
- [x] 5.6 Update `e2e/tests/mcp-proxy.test.ts` — rename all `RoleType` usages

## 6. Update Spec Files

- [x] 6.1 Update `openspec/specs/role-core-type-system/spec.md` (renamed folder) — replace all `RoleType`/`roleTypeSchema` with `Role`/`roleSchema`
- [x] 6.2 Update `openspec/specs/unified-role-discovery/spec.md` — replace all `RoleType` with `Role`
- [x] 6.3 Update `openspec/specs/materializer-interface/spec.md`
- [x] 6.4 Update `openspec/specs/project-local-docker-build/spec.md`
- [x] 6.5 Update `openspec/specs/docker-generation-container-ignore/spec.md`
- [x] 6.6 Update `openspec/specs/mason-skill-scanner/spec.md`
- [x] 6.7 Update `openspec/specs/monorepo-generation/spec.md`
- [x] 6.8 Update `openspec/specs/cli-command-refactor/spec.md`
- [x] 6.9 Update `openspec/specs/read-packaged-role/spec.md`
- [x] 6.10 Update `openspec/specs/role-md-parser-dialect-registry/spec.md`
- [x] 6.11 Update `openspec/specs/role-to-resolved-agent-adapter/spec.md`

## 7. Update Documentation

- [x] 7.1 Update `DEVELOPMENT.md` — replace all `RoleType`/`roleTypeSchema` with `Role`/`roleSchema`
- [x] 7.2 Update `openspec/prds/agent-roles/PRD.md` — replace all `RoleType` with `Role`
- [x] 7.3 Update `openspec/prds/agent-roles/IMPLEMENTATION.md` — replace all `RoleType` with `Role`

## 8. Verify

- [x] 8.1 Run `npx tsc --noEmit` from repo root — confirm zero type errors (1 pre-existing error in package.test.ts unrelated to rename)
- [x] 8.2 Run `npx eslint src/ tests/` in `packages/shared` and `packages/cli` — confirm zero lint errors (pre-existing errors only, unrelated to rename)
- [x] 8.3 Run `npx vitest run` in `packages/shared` and `packages/cli` — all tests pass (168 + 629 = 797 tests)
- [x] 8.4 Grep for remaining `RoleType` and `roleTypeSchema` in source and docs (excluding `openspec/changes/archive/` and `e2e/tmp/`) — none remain
