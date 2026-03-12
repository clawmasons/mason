## Why

Change 5 of the agent-roles PRD requires a unified discovery layer that finds roles from all sources — local ROLE.md files across all known agent directories and installed NPM packages — merges them with precedence rules, and presents a unified list. Without this, downstream consumers (CLI `chapter list`, `run` command, materializer) have no single entry point to enumerate and resolve available roles. This is the glue between the parser (Change 2), package reader (Change 3), and the CLI/materializer layers (Changes 6+).

## What Changes

- `packages/shared/src/role/discovery.ts`: New module implementing:
  - `discoverRoles(projectDir: string): Promise<RoleType[]>` — scans all sources and returns a deduplicated, precedence-ordered list of available roles
  - `resolveRole(name: string, projectDir: string): Promise<RoleType>` — resolves a single role by name using the same precedence rules
  - `RoleDiscoveryError` — error class for discovery failures
- `packages/shared/src/role/index.ts`: Export `discoverRoles`, `resolveRole`, and `RoleDiscoveryError` from barrel
- `packages/shared/src/index.ts`: Re-export `discoverRoles`, `resolveRole`, and `RoleDiscoveryError` from top-level barrel
- `packages/shared/tests/role-discovery.test.ts`: Tests covering: discover local roles across multiple agent directories, discover packaged roles from node_modules, local-over-package precedence, handle no roles found, resolveRole success, resolveRole not found error, roles from multiple dialects

## How to Verify

```bash
npx tsc --noEmit          # TypeScript compiles
npx vitest run             # All tests pass (new tests for discovery)
npx eslint packages/shared/src/ packages/shared/tests/  # Lint passes
```
