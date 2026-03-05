## Why

forge has validated schemas for all five package types and a working CLI with `forge init`, but no way to read installed packages or understand their relationships. The dependency graph resolver is the core engine that powers every downstream command: `forge validate` needs it to check permission coverage, `forge install` needs it to compute toolFilters, and `forge build` needs it to produce lock files. Without a resolver that walks agent → roles → tasks → apps + skills, none of those commands can function.

## What Changes

- Define `ResolvedAgent`, `ResolvedRole`, `ResolvedTask`, `ResolvedApp`, and `ResolvedSkill` TypeScript types representing the flattened, fully-resolved dependency graph
- Implement package discovery: read `package.json` files from `node_modules/` and the monorepo workspace directories, parse their `forge` fields using existing Zod schemas
- Implement the graph resolver: given an agent package name, walk the typed dependency graph (agent → roles → tasks → apps + skills), resolving transitive dependencies
- Detect and report circular dependencies in composite task chains
- Produce actionable error messages for missing dependencies, invalid forge fields, and type mismatches (e.g., an agent depending directly on an app instead of through a role)

## Capabilities

### New Capabilities
- `package-discovery`: Read and validate forge package metadata from node_modules and workspace directories. Provides a `discoverPackages()` function returning all forge packages in the workspace.
- `dependency-graph-resolution`: Walk the typed dependency graph from an agent package to produce a `ResolvedAgent` with all roles, tasks, apps, and skills fully resolved. Includes circular dependency detection and missing dependency reporting.

### Modified Capabilities

## Impact

- **New source files:** `src/resolver/` directory with package discovery and graph resolution modules
- **New types:** `ResolvedAgent`, `ResolvedRole`, `ResolvedTask`, `ResolvedApp`, `ResolvedSkill` exported from `src/resolver/types.ts`
- **Depends on:** Existing Zod schemas from `src/schemas/` for forge field validation
- **New test files:** `tests/resolver/` with unit tests using fixture package.json files
- **Updated exports:** `src/index.ts` updated to export resolver types and functions
