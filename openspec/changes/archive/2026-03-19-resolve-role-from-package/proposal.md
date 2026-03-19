## Why

Role names like `configure-project` or `@clawmasons/role-configure-project` refer to npm packages, but the current resolver only matches by scanning all installed packages — it doesn't do direct package lookups or check globally installed packages. This means roles installed globally (e.g., `npm install -g @clawmasons/role-configure-project`) are invisible to mason, and specifying a package name directly doesn't do a targeted lookup.

## What Changes

- When resolving a role with a package name, only look for it in packages (e.g., `@clawmasons/role-configure-project`) 
- package lookup should first check local `node_modules/`, 
- Extend `node_modules` lookup to also check **globally installed npm packages** (via `npm root -g` or known global paths)
- When a plain role name (e.g., `configure-project`) is not found locally, automatically convert it to `@clawmasons/role-{name}` and retry as a package lookup
- When loading a role from a package, validate that all referenced dependency paths (subdirectories of the package) exist; collect **all missing dependencies** before throwing — never fail on the first missing dep
- The error message for missing dependencies SHALL include the path to the `ROLE.md` that was being loaded and a list of all missing dependency paths

## Capabilities

### New Capabilities
- `role-package-name-resolution`: Direct lookup and auto-conversion of role names to npm package names (`@clawmasons/role-{name}`), covering both local and global `node_modules`
- `role-dependency-validation`: Validate all package-relative dependency paths exist when loading a role package, collecting all failures before reporting

### Modified Capabilities
- `unified-role-discovery`: 
    - When resolving a role with a package name, only look for it in packages (e.g., `@clawmasons/role-configure-project`) 
    - package lookup should first check local `node_modules/`, 
    - Extend `node_modules` lookup to also check **globally installed npm packages** (via `npm root -g` or known global paths)
    - When a plain role name (e.g., `configure-project`) is not found locally, automatically convert it to `@clawmasons/role-{name}` and retry as a package lookup

- `read-packaged-role`: Must validate that all dependency subdirectories referenced in ROLE.md exist within the package, collecting all missing paths

- add test coverage
  
## Impact

- `packages/shared/src/role/discovery.ts` — `resolveRole()` and `findPackagedRole()` gain direct package name lookup + global lookup path
- `packages/shared/src/role/package-reader.ts` — `readPackagedRole()` gains dependency path validation with full error accumulation
- New utility for resolving global npm root path
- Error types: new or updated error for missing dependencies (multi-path variant)

