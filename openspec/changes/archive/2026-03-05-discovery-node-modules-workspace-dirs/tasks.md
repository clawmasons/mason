## 1. Add workspace-dir scanning to scanNodeModules

- [x] 1.1 Create helper function `scanPackageWorkspaceDirs(pkgDir, packages)` in `src/resolver/discover.ts` that iterates `WORKSPACE_DIRS`, checks if each exists as a subdirectory of `pkgDir`, scans entries with `tryReadPackage()`, and only registers via `packages.set()` when `!packages.has(pkg.name)` (preserving workspace-local precedence)
- [x] 1.2 Call `scanPackageWorkspaceDirs()` from `scanNodeModules()` for each package directory (both scoped and unscoped), after the existing direct forge-field check

## 2. Add tests for node_modules workspace dir scanning

- [x] 2.1 Add test: `discoverPackages()` finds sub-components inside a node_modules package that has workspace dirs (e.g., `node_modules/@clawmasons/forge-core/apps/filesystem/package.json`)
- [x] 2.2 Add test: workspace-local packages take precedence over sub-components found in node_modules workspace dirs
- [x] 2.3 Add test: node_modules packages without workspace dirs are unaffected (existing behavior preserved)
- [x] 2.4 Add test: a package with both a direct forge field AND workspace dirs has both registered

## 3. Verify

- [x] 3.1 Run `npx tsc --noEmit` to confirm TypeScript compiles (9 pre-existing errors in CLI test mocks, zero in our files)
- [x] 3.2 Run `npx vitest run` to confirm all tests pass (529 passed, 36 files, including 20 discovery tests)
- [x] 3.3 Run `npx eslint src/ tests/` to confirm linting passes
