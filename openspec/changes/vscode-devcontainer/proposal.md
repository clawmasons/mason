## Why

Agents today only run interactively in a terminal — there is no way to open an agent session in VSCode and use the full IDE surface (terminals, extensions, debuggers, the file explorer) against the running agent container. Adding `--vscode` to `mason run` launches the agent container as a VSCode devcontainer, giving developers a richer environment for working alongside an agent and enabling a dedicated VSCode extension to surface agent activity.

## What Changes

- New `--vscode` flag on `mason run <agent-type> --role <role>` (e.g. `mason claude --vscode --role engineering`)
- CLI generates a `devcontainer.json` at `.mason/sessions/{sessionId}/` that points to a devcontainer-adapted `docker-compose.yml`
- `devcontainer.json` wires VSCode lifecycle hooks to `agent-entry` subcommands for credential injection and agent startup
- `agent-entry` gains two new subcommands: `devcontainer-setup` (writes `~/.vscode-server/server-env-setup`) and `cred-fetch` (fetches credentials via the proxy MCP and outputs them as shell exports)
- The credential service gains a daemon mode so it persists on the host across the devcontainer lifecycle; `initializeCommand` in `devcontainer.json` ensures it is running before the container starts
- CLI launches `code --folder-uri` with a hex-encoded JSON URI pointing to the session devcontainer.json and opening `/home/mason/workspace/project` inside the container
- New `mason-agent` VSCode extension installed into the devcontainer to surface agent status, tool calls, and logs

## Capabilities

### New Capabilities

- `vscode-devcontainer-session`: Session type, `devcontainer.json` generation, devcontainer-adapted `docker-compose.yml`, and `code --folder-uri` launch from the CLI
- `agent-entry-devcontainer`: `agent-entry devcontainer-setup` and `agent-entry cred-fetch` subcommands; credentials fetched via the existing proxy MCP credential_request flow and exported into the VSCode server environment via `~/.vscode-server/server-env-setup`
- `credential-daemon`: Host-side credential service daemon mode — `mason credential-daemon ensure` starts and keeps the service running for a session; used by `initializeCommand` in the generated devcontainer.json
- `mason-agent-extension`: VSCode extension package that connects to the proxy from inside the devcontainer to display agent status, live tool calls, and session logs

### Modified Capabilities

## Impact

- `packages/cli` — new `--vscode` flag on the run command, `devcontainer.json` generator, devcontainer compose variant, `code --folder-uri` launch logic, `mason credential-daemon` subcommand
- `packages/agent-entry` — `devcontainer-setup` and `cred-fetch` subcommands added to the CLI dispatch; reuses existing `connectToProxy` and `requestCredentials` functions
- `packages/credential-service` — daemon mode: run as a detached background process, write PID file to session directory, idempotent start
- `packages/mason-agent-extension` (new) — VSCode extension; connects to `proxy-{role}:9090` from inside the devcontainer
- `.mason/sessions/{sessionId}/` layout gains `devcontainer.json` alongside the existing `docker/` subdirectory
