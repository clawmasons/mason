## Context

Forge discovers packages by scanning local workspace directories and `node_modules`. The current `scanNodeModules()` function only checks each top-level package (including scoped) for a direct `forge` field in its `package.json`. Component library packages like `@clawmasons/forge-core` use the standard forge workspace layout internally (`apps/`, `tasks/`, `skills/`, `roles/`, `agents/`), but their sub-components are not discovered because `scanNodeModules()` does not recurse into workspace-style directories within node_modules packages.

The PRD (REQ-003) requires that `discoverPackages()` scan inside installed npm packages that contain forge workspace directories, registering sub-components the same way local workspace directories are scanned.

## Goals / Non-Goals

**Goals:**
- Enhance `scanNodeModules()` to detect and scan workspace directories inside node_modules packages
- Register discovered sub-components while preserving workspace-local precedence
- Add tests verifying sub-package discovery, precedence, and no-regression for existing behavior

**Non-Goals:**
- Changing the `scanWorkspaceDir()` function signature or behavior
- Adding a formal "collection" package type (REQ-013, P2 future work)
- Scanning nested `node_modules/` inside packages (only the root `node_modules/` is scanned)

## Decisions

### 1. New helper using tryReadPackage with precedence guard

We cannot directly reuse `scanWorkspaceDir()` because it calls `packages.set()` unconditionally — which would overwrite workspace-local packages that were registered first. Instead, we create `scanPackageWorkspaceDirs(pkgDir, packages)` which iterates `WORKSPACE_DIRS`, checks if each exists as a subdirectory of `pkgDir`, scans their entries with `tryReadPackage()`, and only registers results when `!packages.has(pkg.name)`. This reuses the same `tryReadPackage()` logic while preserving the precedence guard needed for node_modules scanning.

### 2. Scan workspace dirs after checking for direct forge field

The scanning order within `scanNodeModules()` is: first check the package itself for a `forge` field (existing behavior), then check for workspace dirs. A package can be both — it can have its own `forge` field AND contain workspace dirs with sub-components. Both are registered.

### 3. Workspace-local precedence preserved via existing `packages.has()` check

`scanNodeModules()` already skips packages whose names are already in the map (populated by local workspace scanning which runs first). The sub-component scanning uses the same `packages.has()` guard, so local workspace packages always win. No new precedence logic is needed.

### 4. Helper function for scanning workspace dirs in a package

We extract a small helper `scanPackageWorkspaceDirs()` that takes a package directory path and the packages map, then checks for each WORKSPACE_DIR and scans it. This keeps `scanNodeModules()` clean and avoids deep nesting.

## Risks / Trade-offs

- **[Risk] Performance with many node_modules packages** -- For each package in node_modules, we now check for the existence of up to 5 directories (`apps/`, `tasks/`, etc.). This uses `fs.existsSync()` which is cheap for missing paths. Real-world node_modules rarely have packages with these directory names, so the overhead is negligible.
- **[Risk] False positives from unrelated packages** -- A non-forge package could coincidentally have an `apps/` directory. However, sub-directories are only registered if they contain a `package.json` with a valid `forge` field, so false positives are impossible.
- **[Trade-off] Only scans root node_modules** -- We do not recursively scan nested `node_modules/` inside packages. This matches npm's flat dependency model and avoids exponential scanning. If needed, nested scanning can be added later.
