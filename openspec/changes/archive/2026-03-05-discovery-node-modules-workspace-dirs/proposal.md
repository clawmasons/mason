## Why

Forge's discovery system (`discoverPackages()`) currently scans two locations: local workspace directories (`apps/`, `tasks/`, `skills/`, `roles/`, `agents/`) and top-level packages in `node_modules/` that have a `forge` field. This means that component library packages like `@clawmasons/forge-core` — which bundle multiple forge components inside workspace-style subdirectories — are invisible to discovery. Only the library's own `package.json` would be found, not the individual components it contains.

With `forge-core` now existing as an npm workspace member (Change 1), we need discovery to look *inside* node_modules packages that contain workspace directories and register the sub-components they contain. This is the critical link that makes `npm install @clawmasons/forge-core` result in all its components being automatically discoverable.

## What Changes

- Modify `scanNodeModules()` in `src/resolver/discover.ts` to detect when a node_modules package contains workspace directories (`apps/`, `tasks/`, `skills/`, `roles/`, `agents/`)
- When workspace directories are found inside a node_modules package, scan them for forge sub-packages using the same logic as `scanWorkspaceDir()`
- Sub-packages found this way are registered in the map only if no package with the same name already exists (preserving workspace-local precedence)
- Add comprehensive test cases to `tests/resolver/discover.test.ts`

## Capabilities

### Modified Capabilities
- `package-discovery`: Enhanced to scan workspace directories inside node_modules packages, enabling component library packages like forge-core to expose their sub-components to discovery.

### New Capabilities
_(none)_

## Impact

- **`src/resolver/discover.ts`**: ~15-20 lines added to `scanNodeModules()` — after checking a package for a direct `forge` field, also check for workspace dirs and scan them
- **`tests/resolver/discover.test.ts`**: New test describe block for node_modules workspace dir scanning (~3-4 test cases)
- **Existing behavior**: Fully preserved — workspace-local packages still take precedence, direct forge-field packages in node_modules still discovered, no changes to `tryReadPackage()` or `scanWorkspaceDir()`
