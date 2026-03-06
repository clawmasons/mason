## Why

The `example/` directory was the original demonstration workspace with `@example/*`-scoped components. With the creation of `forge-core/` (Change #1), all components have been migrated to `@clawmasons/*` naming under `forge-core/`. The `example/` directory is now redundant and creates confusion about which directory is the canonical source of components.

Two source files still reference `example/`:
1. `tests/integration/forge-proxy.test.ts` uses `@example/app-filesystem` as a constant name
2. `tests/integration/mcp-proxy.sh` runs `forge install` from `example/` directory using `@example/agent-note-taker`

Additionally, `README.md` references the `example/` directory and uses `@example/*` package names in CLI examples.

## What Changes

- Update `tests/integration/forge-proxy.test.ts`: change `APP_NAME` from `@example/app-filesystem` to `@clawmasons/app-filesystem`
- Update `tests/integration/mcp-proxy.sh`: change `EXAMPLE_DIR` to point at `forge-core/`, update agent name from `@example/agent-note-taker` to `@clawmasons/agent-note-taker`, update all references
- Update `README.md`: remove the "Example" section referencing `example/`, update CLI examples to use `@clawmasons/*` names
- Delete the entire `example/` directory

## Capabilities

### Modified Capabilities
- None. This is a cleanup change that removes dead code and updates test fixtures. No runtime capabilities are modified.

## Impact

- **`tests/integration/forge-proxy.test.ts`**: One constant renamed (`@example/app-filesystem` to `@clawmasons/app-filesystem`)
- **`tests/integration/mcp-proxy.sh`**: Directory path changed from `example/` to `forge-core/`, agent name changed from `@example/agent-note-taker` to `@clawmasons/agent-note-taker`
- **`README.md`**: CLI examples updated to `@clawmasons/*` names, example directory reference removed
- **`example/`**: Entire directory deleted (agents, apps, roles, skills, tasks, package.json, README.md, .env)
- No source code changes to `src/`
