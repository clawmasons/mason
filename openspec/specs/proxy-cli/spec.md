# proxy-cli

## Overview

The `forge proxy` CLI command orchestrates the full proxy startup sequence: discovers packages in the workspace, resolves the agent dependency graph, computes tool filters, loads credentials, opens the SQLite database, connects to upstream MCP servers, builds routing tables, and starts the downstream MCP server.

## Source

- `src/cli/commands/proxy.ts` — command registration and startup orchestrator
- `src/cli/commands/index.ts` — command registration entry point (modified)

## Public API

### `registerProxyCommand(program: Command): void`

Registers the `forge proxy` command on the Commander.js program instance.

### `startProxy(rootDir: string, options: ProxyOptions): Promise<void>`

Main startup orchestrator. Follows PRD §6.2 startup sequence:

1. Discover packages via `discoverPackages(rootDir)`
2. Resolve agent (auto-detect single agent or use `--agent` flag)
3. Compute tool filters from role permissions
4. Load `.env` credentials and resolve `${VAR}` references
5. Open SQLite database (`~/.forge/forge.db`)
6. Start upstream MCP clients in parallel (with configurable timeout)
7. Enumerate tools/resources/prompts and build routing tables
8. Collect approval patterns from all roles
9. Start MCP server on configured port
10. Log "forge proxy ready" with summary

### CLI Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--port <number>` | Port to listen on | Agent config or 9090 |
| `--startup-timeout <seconds>` | Upstream initialization timeout | 60 |
| `--agent <name>` | Agent package name | Auto-detect if single agent |

## Behavior

- **Auto-detection:** If `--agent` not provided, discovers all agent packages. Uses the single agent if exactly one exists. Errors with descriptive message if zero or multiple found.
- **Graceful shutdown:** Handles SIGINT/SIGTERM. Closes server, upstream clients, and database in order.
- **Startup failure:** Cleans up resources and exits with code 1 and descriptive error message.
- **App deduplication:** Apps referenced by multiple roles get a single upstream connection.
- **Approval patterns:** Collected from all roles' `constraints.requireApprovalFor` arrays (deduplicated).

## Dependencies

- `src/resolver/discover.ts` — `discoverPackages()`
- `src/resolver/resolve.ts` — `resolveAgent()`
- `src/generator/toolfilter.ts` — `computeToolFilters()`
- `src/proxy/credentials.ts` — `loadEnvFile()`, `resolveEnvVars()`
- `src/proxy/db.ts` — `openDatabase()`
- `src/proxy/upstream.ts` — `UpstreamManager`
- `src/proxy/router.ts` — `ToolRouter`, `ResourceRouter`, `PromptRouter`
- `src/proxy/server.ts` — `ForgeProxyServer`

## Tests

- `tests/cli/proxy.test.ts` — 13 tests covering command registration, auto-detection, flag handling, approval patterns
