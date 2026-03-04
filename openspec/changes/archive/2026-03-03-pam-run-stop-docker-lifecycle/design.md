## Context

After `pam install <agent>`, a scaffolded directory exists at `.pam/agents/<agent-short-name>/` containing `docker-compose.yml`, `.env`, `mcp-proxy/config.json`, and runtime workspace directories. Users currently must manually invoke `docker compose -f <path>/docker-compose.yml up` to start the agent stack. The `pam run` and `pam stop` commands wrap this into the pam CLI.

The install command already writes the output directory path as `.pam/agents/<short-name>/` by default (or a custom `--output-dir`). The run/stop commands need to locate this directory, validate prerequisites, and delegate to `docker compose`.

## Goals / Non-Goals

**Goals:**
- `pam run <agent>` starts the full Docker Compose stack (proxy + all runtimes)
- `pam run <agent> --runtime=X` starts only the proxy and the specified runtime service
- `pam stop <agent>` tears down the Docker Compose stack
- Validate that `.env` has all required credentials filled in before starting
- Propagate Docker Compose exit codes through pam

**Non-Goals:**
- Hot-reload or watch mode (future consideration)
- Health checking of individual services after startup
- Log streaming/tailing (users can use `docker compose logs` directly)
- Multi-agent orchestration in a single compose stack

## Decisions

### 1. Agent directory resolution

The run/stop commands locate the agent's scaffolded directory at `.pam/agents/<short-name>/` relative to the workspace root (current working directory). This matches the install command's default output. An `--output-dir` option is supported for custom locations.

**Alternative considered:** Storing the output directory in a registry file. Rejected — adds state management complexity for little benefit. The convention-based path is simple and predictable.

### 2. Docker Compose delegation via child process

Commands delegate to `docker compose` (v2 CLI) using Node.js `child_process.execSync` (or `spawn` for streaming output). The compose file path is passed via `-f`. This keeps pam as a thin orchestration layer.

**Alternative considered:** Using the Docker Engine API directly via dockerode. Rejected — adds a heavy dependency, and `docker compose` already handles service orchestration, dependency ordering, and network setup.

### 3. Env validation before run

Before starting Docker, the run command reads the `.env` file and checks that all variables have non-empty values. Empty or placeholder values (e.g., lines with just `VAR=` or `VAR=your-value-here`) cause an error listing the missing variables. This prevents cryptic Docker failures from missing credentials.

### 4. Runtime filtering with --runtime flag

When `--runtime=X` is specified, the command passes the service names `mcp-proxy` and the specified runtime to `docker compose up`. The proxy always starts because all runtimes depend on it. If the specified runtime doesn't exist in the compose file, an error is shown.

### 5. Stop command simplicity

`pam stop` runs `docker compose down` in the agent directory. No flags beyond the agent name are needed. The `--remove-volumes` flag is not exposed to avoid accidental data loss — users can run docker compose directly for advanced teardown.

## Risks / Trade-offs

- **Docker Compose v2 required** — The commands use `docker compose` (space-separated, v2). Systems with only `docker-compose` (v1 hyphenated) will fail. → Mitigation: Check for `docker compose` availability and show a clear error if not found.
- **Env validation is best-effort** — We check for empty values but can't validate credential correctness. → Mitigation: Clear error messages guide users to fill in the right values.
- **execSync blocks the event loop** — For long-running `docker compose up`, this means no graceful signal handling. → Mitigation: Use `spawn` with `stdio: 'inherit'` to stream output and forward signals.
