## Why

Change 3 of the agent-roles PRD requires loading NPM role packages from `node_modules/` into the same ROLE_TYPES representation as local ROLE.md files. Without this, packaged roles cannot be consumed by the downstream discovery (Change 5), adapter (Change 4), or CLI (Change 8) layers. This is the bridge between "install from npm" and "run as a role."

## What Changes

- `packages/shared/src/role/package-reader.ts`: New module implementing `readPackagedRole(packagePath: string): Promise<RoleType>` — reads a role NPM package directory and constructs a validated ROLE_TYPES object. Steps: (1) Read `package.json` and verify `chapter.type === "role"`. (2) Read the bundled `ROLE.md` from the package directory. (3) Parse ROLE.md frontmatter and body using the existing parser utilities. (4) Resolve all dependency paths relative to the package's location in `node_modules/`. (5) Scan bundled resources. (6) Set `source.type = 'package'` and `source.packageName`.
- `packages/shared/src/role/index.ts`: Export `readPackagedRole` and `PackageReadError` from barrel
- `packages/shared/src/index.ts`: Re-export `readPackagedRole` and `PackageReadError` from top-level barrel
- `packages/shared/tests/role-package-reader.test.ts`: Tests covering: valid package loading, ROLE_TYPES equivalence with local parse (except source), dependency path resolution, missing ROLE.md error, missing/invalid package.json error, wrong chapter.type error

## How to Verify

```bash
npx tsc --noEmit          # TypeScript compiles
npx vitest run             # All tests pass (new tests for package reader)
npx eslint packages/shared/src/ packages/shared/tests/  # Lint passes
```
