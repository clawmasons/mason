## Tasks

- [x] Create `packages/shared/src/role/package-reader.ts` with `readPackagedRole()` and `PackageReadError`
- [x] Export from `packages/shared/src/role/index.ts` barrel
- [x] Export from `packages/shared/src/index.ts` top-level barrel
- [x] Write tests: 19 tests covering valid packages, equivalence, error cases, path resolution
- [x] Verify: `npx tsc --noEmit` compiles
- [x] Verify: `npx vitest run` passes (1208 tests, 19 new)
- [x] Verify: `npx eslint` passes on new files
