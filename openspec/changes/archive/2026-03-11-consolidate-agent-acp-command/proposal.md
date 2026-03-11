## Why

The CLI currently has two separate top-level commands for running agents: `clawmasons agent` (interactive Docker mode) and `clawmasons acp` (editor integration mode). They share significant startup logic (role resolution, Docker Compose generation, credential handling) but implement it independently, leading to divergence. The `agent` command starts the credential service as a separate Docker container, while the `acp` command runs it in-process — the in-process approach is strictly better (faster startup, no extra container, direct keychain access).

Consolidating into a single `clawmasons agent` command with a `-acp` flag reduces surface area, ensures shared startup routines, and makes the credential service consistently in-process for both modes.

## What Changes

- Merge `run-acp-agent.ts` functionality into `run-agent.ts` as the unified `agent` command
- Add `-acp` flag to switch between interactive mode (default) and ACP/editor mode
- Both modes start the credential service in-process (remove the credential-service Docker container)
- Remove the standalone `acp` command registration
- Remove credential-service from Docker Compose generation (both `generateComposeYml` and `generateAcpComposeYml`)
- Update `run-agent` to start credential service in-process before launching the agent container
- Update all documentation: cli.md, architecture.md, component-credential-service.md, get-started.md
- Update all unit tests and e2e tests

## Capabilities

### Modified Capabilities
- `agent-command`: Consolidated command now supports both interactive and ACP modes via `-acp` flag. Credential service runs in-process in both modes.
- `acp-command`: Absorbed into `agent` command. `clawmasons acp` is removed.
- `docker-compose-generation`: Credential-service container removed from compose files in both modes.
- `credential-service-startup`: Always in-process on the host, never containerized.

## Impact

- **Modified:** `packages/cli/src/cli/commands/run-agent.ts` — major rewrite to absorb ACP functionality and in-process credential service
- **Modified:** `packages/cli/src/cli/commands/run-acp-agent.ts` — removed (or reduced to re-export for backward compat)
- **Modified:** `packages/cli/src/cli/commands/index.ts` — remove `acp` command registration
- **Modified:** `packages/cli/src/acp/session.ts` — remove credential-service from compose generation
- **Modified:** `packages/cli/tests/cli/run-agent.test.ts` — update for new startup flow, in-process credential service
- **Modified:** `packages/cli/tests/cli/run-acp-agent.test.ts` — migrate relevant tests to run-agent tests
- **Modified:** `docs/cli.md` — update command reference
- **Modified:** `docs/architecture.md` — update container diagrams (two containers, not three)
- **Modified:** `docs/component-credential-service.md` — always in-process, not containerized
- **Modified:** `docs/get-started.md` — update run command examples
- **Modified:** `e2e/acp-client-spawn.test.ts` — update for `agent -acp` invocation
