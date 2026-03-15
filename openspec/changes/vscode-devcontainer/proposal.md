## Why

Agents today only run interactively in a terminal — there is no way to connect an IDE like VSCode to an agent session and use the full IDE surface (terminals, extensions, debuggers, the file explorer) against the running agent container. Adding `--dev-container` to `mason run` starts the agent container normally (mason owns the lifecycle) and then prints connection instructions for attaching any dev-container-compatible IDE to the already-running container. Optionally, if VSCode is installed, the user can choose to have mason launch it and attach automatically.

## What Changes

- New `--dev-container` flag on `mason run --agent <agent-type> --dev-container --role <role>` (e.g. `mason run --agent claude --dev-container --role engineering`)
- New `mode` for `.mason/config.json` of 'dev-container'
- Mason starts the container using the existing session flow (proxy + agent via docker compose), then prints connection instructions to the terminal explaining how to attach a dev-container-compatible IDE (VSCode, Cursor, etc.) to the running container; mason does **not** launch any IDE automatically
- After printing instructions, mason prompts the user: "Would you like to launch VSCode and attach to the container? (y/N)" — if confirmed and `code` is available on PATH, mason constructs and executes the `code --folder-uri` command with the `attached-container` URI pointing at the agent container; if `code` is not found, mason prints an error indicating VSCode is not installed or not on PATH
- The VSCode attach command encodes the container name into a hex-encoded JSON config and constructs the URI: `vscode-remote://attached-container+<hex-config><workspace-path>` — implemented using Node.js `Buffer` hex encoding to avoid shell dependencies
- Mason stays alive after the container starts to own the credential service lifecycle; tearing down the session when the user Ctrl+C's
- `.mason/docker/vscode-server/` is created on the host and mounted into the agent container at `/home/mason/.vscode-server`; the VS Code Server binary, installed extensions, and `server-env-setup` all persist there across container restarts and rebuilds, eliminating repeated downloads
- `server-env-setup` is static content (`eval "$(agent-entry cred-fetch)"`) written once into the persistent mount; `agent-entry cred-fetch` reads `MCP_PROXY_TOKEN`, `MCP_PROXY_URL`, and `AGENT_CREDENTIALS` from the container environment (already set by docker-compose) and outputs shell exports — no session-specific values are ever baked into the file
- A `devcontainer.json` is written into the container's workspace (at `/home/mason/workspace/.devcontainer.json`) for extension and settings configuration only; it does not control container lifecycle

## Capabilities

### New Capabilities

- `dev-container-start`: `--dev-container` flag on `mason run` — mason starts the agent container via the existing session flow, prints IDE connection instructions to the terminal, and prompts the user to optionally launch VSCode; mason owns the session lifecycle and tears down on Ctrl+C
- `vscode-attach`: optional post-start step — if the user confirms and `code` is on PATH, mason constructs the `attached-container` URI (hex-encoding the container name) and spawns `code --folder-uri` to attach VSCode to the running container workspace
- `agent-entry-cred-fetch`: `agent-entry cred-fetch` subcommand — connects to the proxy, requests all declared credentials, and outputs them as shell exports; called by the static `server-env-setup` script on every VS Code Server start using env vars already present in the container

### Modified Capabilities

## Impact

- `packages/cli` — new `--dev-container` flag on the run command; after container start, prints connection instructions then interactively prompts the user; if VSCode launch is confirmed, constructs and executes the `attached-container` URI using `Buffer` hex encoding; creates `.mason/docker/vscode-server/` directory during setup
- `packages/agent-entry` — new `cred-fetch` subcommand outputs shell exports; `server-env-setup` is written once to the persistent mount (static content, never session-specific); agent runtime spawned in background in dev-container mode
- `docker-compose.yml` (dev-container variant) — adds volume mount `{projectDir}/.mason/docker/vscode-server:/home/mason/.vscode-server` to the agent service
- `.mason/sessions/{sessionId}/` layout unchanged; a `devcontainer.json` is written into the container workspace for extension/settings config only
