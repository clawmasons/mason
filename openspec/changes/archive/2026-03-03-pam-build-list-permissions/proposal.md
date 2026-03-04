# Proposal: pam build, list, and permissions Commands

## Why

After `pam install` is implemented, developers have no read-only introspection commands to understand what's installed, audit the resolved permission matrix, or generate a lock file without full scaffolding. The install command does everything at once — there's no way to inspect the agent graph, verify permissions, or lock dependencies independently. These three commands complete the core CLI surface.

## What Changes

Implement three new CLI commands that provide read-only visibility into the agent configuration:

1. **`pam build <agent>`** — Resolves the dependency graph and produces `pam.lock.json` without scaffolding runtime directories. Useful for CI/CD lock file generation and graph validation without side effects.

2. **`pam list`** — Displays all installed agents and their resolved role/task/app/skill tree in a human-readable format. Requires no arguments — scans the workspace.

3. **`pam permissions <agent>`** — Displays the resolved permission matrix (role → app → allowed tools) and the generated toolFilter for each app. The primary audit tool for governance review.

## Capabilities

### New
- **build-command** — CLI command that resolves an agent graph and writes pam.lock.json
- **list-command** — CLI command that discovers and displays installed agents as a tree
- **permissions-command** — CLI command that renders the permission matrix and toolFilter

### Modified
- **cli-framework** — Three new commands registered in the command index

## Impact

- **New files:** `src/cli/commands/build.ts`, `src/cli/commands/list.ts`, `src/cli/commands/permissions.ts`, plus test files
- **Modified files:** `src/cli/commands/index.ts` (register new commands)
- **Dependencies:** Reuses existing `discoverPackages`, `resolveAgent`, `computeToolFilters`, `generateLockFile` — no new library dependencies
