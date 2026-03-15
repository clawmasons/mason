## Why

Agents today only run interactively in a terminal — there is no way to open an agent session in VSCode and use the full IDE surface (terminals, extensions, debuggers, the file explorer) against the running agent container. Adding `--vscode` to `mason run` starts the agent container normally (mason owns the lifecycle) and then attaches VSCode to the already-running container, giving developers a richer environment for working alongside an agent.

## What Changes

- New `--vscode` flag on `mason run --agent <agent-type> --vscode --role <role>` (e.g. `mason run --agent claude --vscode --role engineering`)
- Mason starts the container using the existing session flow (proxy + agent via docker compose), then launches `code --folder-uri` with an `attached-container` URI pointing at the running agent container
- Mason stays alive after launching VSCode to own the credential service lifecycle; tearing down the session when VSCode disconnects or the user Ctrl+C's
- `.mason/docker/vscode-server/` is created on the host and mounted into the agent container at `/home/mason/.vscode-server`; the VS Code Server binary, installed extensions, and `server-env-setup` all persist there across container restarts and rebuilds, eliminating repeated downloads
- `server-env-setup` is static content (`eval "$(agent-entry cred-fetch)"`) written once into the persistent mount; `agent-entry cred-fetch` reads `MCP_PROXY_TOKEN`, `MCP_PROXY_URL`, and `AGENT_CREDENTIALS` from the container environment (already set by docker-compose) and outputs shell exports — no session-specific values are ever baked into the file
- A `devcontainer.json` is written into the container's workspace (at `/home/mason/workspace/.devcontainer.json`) for extension and settings configuration only; it does not control container lifecycle

## Capabilities

### New Capabilities

- `vscode-container-attach`: `--vscode` flag on `mason run`, container startup using the existing session flow, `code --folder-uri attached-container` launch, and mason process lifecycle management while VSCode is connected
- `agent-entry-vscode`: `agent-entry cred-fetch` subcommand — connects to the proxy, requests all declared credentials, and outputs them as shell exports; called by the static `server-env-setup` script on every VS Code Server start using env vars already present in the container

### Modified Capabilities

## Impact

- `packages/cli` — new `--vscode` flag on the run command, `attached-container` URI encoding and `code` launch, mason process stays running as credential service host; creates `.mason/docker/vscode-server/` directory during setup
- `packages/agent-entry` — new `cred-fetch` subcommand outputs shell exports; `server-env-setup` is written once to the persistent mount (static content, never session-specific); agent runtime spawned in background in vscode mode
- `docker-compose.yml` (vscode variant) — adds volume mount `{projectDir}/.mason/docker/vscode-server:/home/mason/.vscode-server` to the agent service
- `.mason/sessions/{sessionId}/` layout unchanged; a `devcontainer.json` is written into the container workspace for extension/settings config only
