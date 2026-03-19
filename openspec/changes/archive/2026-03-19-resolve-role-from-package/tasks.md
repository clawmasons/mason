## 1. Global npm root utility

- [x] 1.1 Create `packages/shared/src/role/global-npm-root.ts` exporting `getGlobalNpmRoot(): Promise<string | null>` — runs `npm root -g`, caches result in module-level variable, returns null on failure
- [x] 1.2 Add unit tests for `getGlobalNpmRoot` covering: successful call, error/non-zero exit returns null, result is cached (called once)

## 2. PackageDependencyError type

- [x] 2.1 Add `PackageDependencyError` class to `packages/shared/src/role/package-reader.ts` with `roleMdPath: string` and `missingPaths: string[]` fields
- [x] 2.2 Export `PackageDependencyError` from `packages/shared/src/role/index.ts` and `packages/shared/src/index.ts`

## 3. Dependency validation in readPackagedRole

- [x] 3.1 After field normalization in `readPackagedRole`, collect all plain-name skills (no `./` or `../` prefix) and check `<packagePath>/skills/<name>/` exists
- [x] 3.2 Collect all plain-name tasks and check `<packagePath>/tasks/<name>/` exists
- [x] 3.3 If any paths are missing, throw `PackageDependencyError` with `roleMdPath` and full `missingPaths` array
- [x] 3.4 Add unit tests: all deps present succeeds; one missing skill throws with path; two missing + one task all listed; path-relative refs not validated; existing PackageReadError cases still pass

## 4. Direct package lookup in discovery

- [x] 4.1 Add `isPackageName(name: string): boolean` helper in `discovery.ts` — returns true if name contains `@` or `/`
- [x] 4.2 Add `lookupPackageByName(packageName: string, nodeModulesDir: string): Promise<Role | undefined>` — checks `<nodeModulesDir>/<packageName>/` directly, returns role if valid, undefined otherwise
- [x] 4.3 Modify `resolveRole` — if `isPackageName(name)`, skip local role lookup, call `lookupPackageByName` for local node_modules, then global node_modules (via `getGlobalNpmRoot`)
- [x] 4.4 If package not found in either location, throw `RoleDiscoveryError` with message identifying the package name and paths attempted

## 5. Auto-convert plain names to clawmasons package

- [x] 5.1 In `resolveRole`, after local role + full scan both miss, retry with `@clawmasons/role-<name>` via `lookupPackageByName` (local then global)
- [x] 5.2 Add unit tests: plain name resolved via auto-converted package; plain name checks global when local absent; plain name fails with clear error when nothing found

## 6. Tests for updated resolveRole

- [x] 6.1 Test: scoped package name resolves from local node_modules directly (no full scan)
- [x] 6.2 Test: scoped package name falls back to global node_modules
- [x] 6.3 Test: scoped package name not found → RoleDiscoveryError
- [x] 6.4 Test: local role still takes precedence over package for plain names
- [x] 6.5 Test: npm root -g failure does not break plain name resolution

## 7. Verification

- [x] 7.1 Run `npx tsc --noEmit` — zero errors
- [x] 7.2 Run `npx eslint src/ tests/` in `packages/shared/` — zero errors
- [x] 7.3 Run `npx vitest run packages/shared/tests/` — all tests pass
