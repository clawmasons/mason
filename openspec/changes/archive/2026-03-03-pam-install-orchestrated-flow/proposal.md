## Why

All the individual pipeline stages exist — package discovery, dependency graph resolution, validation, toolFilter computation, proxy config generation, runtime materialization, Docker Compose generation, .env templating, and lock file generation — but they are not wired together. There is no single command a user can run to go from an agent package to a fully scaffolded, ready-to-run deployment directory. The `pam install` command is the primary user-facing orchestration point that chains all these stages.

## What Changes

- Implement the `pam install <agent-pkg>` CLI command that orchestrates the full install flow:
  1. Discover packages and resolve the agent's dependency graph
  2. Validate the resolved graph (abort on errors)
  3. Generate mcp-proxy `config.json` with computed toolFilters
  4. Look up registered materializers for each declared runtime
  5. Materialize workspace files for each runtime
  6. Generate Dockerfiles and compose service definitions
  7. Generate `docker-compose.yml`, `.env` template, and `pam.lock.json`
  8. Write all generated files to the output directory
  9. Generate a random proxy auth token and write it to `.env`
- Add `--output-dir` option to control where the scaffolded directory is created (defaults to `.pam/agents/{agent-short-name}/`)
- Register the install command in the CLI command index

## Capabilities

### New Capabilities
- `pam-install-command`: The `pam install <agent>` CLI command that orchestrates the full pipeline from package resolution to scaffolded deployment directory, including file I/O and credential generation.

### Modified Capabilities
- `cli-framework`: Updated to register the install command alongside init and validate.

## Impact

- **New file:** `src/cli/commands/install.ts` — the install command implementation
- **Modified file:** `src/cli/commands/index.ts` — registers the install command
- **New tests:** `tests/cli/install.test.ts` — integration tests for the full install flow
- **Dependencies:** Uses `node:crypto` for proxy token generation (built-in, no new npm deps)
