## Why

After `forge install` scaffolds the Docker Compose stack, users must manually run `docker compose -f <path>/docker-compose.yml up` and remember the correct file path. `forge run` and `forge stop` commands are the final step in the agent lifecycle, giving users a single CLI to go from install to running agent without touching Docker directly. These commands also enforce that required `.env` credentials are set before launching.

## What Changes

- Add `forge run <agent> [--runtime=X]` command that starts the Docker Compose stack for an installed agent
- Add `forge stop <agent>` command that tears down the Docker Compose stack
- Validate `.env` file has all required values before starting Docker
- Support `--runtime` flag to start only a specific runtime (plus the proxy)
- Propagate Docker Compose exit codes through forge

## Capabilities

### New Capabilities
- `run-command`: CLI command to start an agent's Docker Compose stack with optional runtime filtering and env validation
- `stop-command`: CLI command to tear down an agent's Docker Compose stack

### Modified Capabilities
_None — these are new commands that consume existing scaffolded output without changing it._

## Impact

- **Code**: New command files in `src/cli/commands/` (run.ts, stop.ts), updates to command registry
- **Dependencies**: Relies on `docker compose` being available on the host system
- **Systems**: Interacts with Docker daemon to manage containers
- **Existing behavior**: No changes to install, build, or other commands
