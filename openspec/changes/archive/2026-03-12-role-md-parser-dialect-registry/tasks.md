## Tasks

- [x] Add `js-yaml` and `@types/js-yaml` as dependencies to `packages/shared`
- [x] Create `packages/shared/src/role/dialect-registry.ts` — dialect field mappings with 3 built-in dialects
- [x] Create `packages/shared/src/role/resource-scanner.ts` — recursive file scanner producing ResourceFile entries
- [x] Create `packages/shared/src/role/parser.ts` — `readMaterializedRole()`, frontmatter parsing, field normalization
- [x] Create `packages/shared/src/role/index.ts` — barrel exports
- [x] Export role module from `packages/shared/src/index.ts`
- [x] Write tests: 38 tests covering dialects, parsing, normalization, resources, error cases
- [x] Verify: `npx tsc --noEmit` compiles
- [x] Verify: `npx vitest run` passes (1189 tests, 38 new)
- [x] Verify: `npx eslint` passes on new files
- [x] Create spec at `openspec/specs/role-md-parser-dialect-registry/spec.md`
- [x] Archive change artifacts
