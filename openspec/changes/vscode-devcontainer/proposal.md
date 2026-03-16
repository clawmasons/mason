## Why

Agents today only run interactively in a terminal — there is no way to connect an IDE like VSCode to an agent session and use the full IDE surface (terminals, extensions, debuggers, the file explorer) against the running agent container. Adding `--dev-container` to `mason run` starts the agent container normally (mason owns the lifecycle) and then prints connection instructions for attaching any dev-container-compatible IDE to the already-running container. Optionally, if VSCode is installed, the user can choose to have mason launch it and attach automatically.

## What Changes

- New `--dev-container` flag on `mason run --agent <agent-type> --dev-container --role <role>` (e.g. `mason run --agent claude --dev-container --role engineering`)
- New `mode` for `.mason/config.json` of 'dev-container'
- New optional `dev-container-customizations` property on agent entries in `.mason/config.json` agents — controls IDE extensions and settings baked into the agent image at build time; if omitted, the default customizations are used (see below)
- Mason starts the container using the existing session flow (proxy + agent via docker compose), then prints connection instructions to the terminal explaining how to attach a dev-container-compatible IDE (VSCode, Cursor, etc.) to the running container; mason does **not** launch any IDE automatically
- After printing instructions, mason prompts the user: "Would you like to launch VSCode and attach to the container? (y/N)" — if confirmed and `code` is available on PATH, mason constructs and executes the `code --folder-uri` command with the `attached-container` URI pointing at the agent container; if `code` is not found, mason prints an error indicating VSCode is not installed or not on PATH
- The VSCode attach command encodes the container name into a hex-encoded JSON config and constructs the URI: `vscode-remote://attached-container+<hex-config><workspace-path>` — implemented using Node.js `Buffer` hex encoding to avoid shell dependencies
- Mason stays alive after the container starts to own the credential service lifecycle; tearing down the session when the user Ctrl+C's
- `.mason/docker/vscode-server/` is created on the host and mounted into the agent container at `/home/mason/.vscode-server`; the VS Code Server binary, installed extensions, and `server-env-setup` all persist there across container restarts and rebuilds, eliminating repeated downloads
- `server-env-setup` is static content (`eval "$(agent-entry cred-fetch)"`) written once into the persistent mount; `agent-entry cred-fetch` reads `MCP_PROXY_TOKEN`, `MCP_PROXY_URL`, and `AGENT_CREDENTIALS` from the container environment (already set by docker-compose) and outputs shell exports — no session-specific values are ever baked into the file
- The agent's Dockerfile receives a `LABEL devcontainer.metadata` instruction at build time, embedding the resolved `dev-container-customizations` as JSON alongside `remoteUser` and `workspaceFolder`; this is how VSCode and other dev-container-compatible IDEs discover extensions and settings without a separate `devcontainer.json` file

### `dev-container-customizations` schema

Added to each agent entry in `.mason/config.json`:

```jsonc
{
  "agents": {
    "claude": {
      // ...existing fields...
      "dev-container-customizations": {
        "vscode": {
          "extensions": ["anthropic.claude-code", "dbaeumer.vscode-eslint", "esbenp.prettier-vscode", "yoavbls.pretty-ts-errors", "usernamehw.errorlens", "eamodio.gitlens", "editorconfig.editorconfig"],
          "settings": {
            "terminal.integrated.defaultProfile.linux": "bash"
          }
        }
      }
    }
  }
}
```

The above is also the **default** applied when `dev-container-customizations` is absent from the agent config.

At image build time the Dockerfile template renders the resolved customizations into a `LABEL`:

```dockerfile
LABEL devcontainer.metadata='[{ \
  "remoteUser": "mason", \
  "workspaceFolder": "/workspace/project", \
  "customizations": {"vscode":{"extensions":[...],"settings":{...}}} \
}]'
```

The label value is the JSON-serialized `dev-container-customizations` object (compact, no extra whitespace) inserted verbatim into the metadata array entry. When VSCode attaches to the container it reads this label and automatically installs the listed extensions and applies the settings inside the container.

## Capabilities

### New Capabilities

- `dev-container-start`: `--dev-container` flag on `mason run` — mason starts the agent container via the existing session flow, prints IDE connection instructions to the terminal, and prompts the user to optionally launch VSCode; mason owns the session lifecycle and tears down on Ctrl+C
- `vscode-attach`: optional post-start step — if the user confirms and `code` is on PATH, mason constructs the `attached-container` URI (hex-encoding the container name) and spawns `code --folder-uri` to attach VSCode to the running container workspace
- `agent-entry-cred-fetch`: `agent-entry cred-fetch` subcommand — connects to the proxy, requests all declared credentials, and outputs them as shell exports; called by the static `server-env-setup` script on every VS Code Server start using env vars already present in the container
- `dev-container-customizations`: optional per-agent config field in `.mason/config.json` — IDE extensions and settings embedded into the agent image via a Dockerfile `LABEL devcontainer.metadata` at build time; a hardcoded default is used when the field is absent

### Modified Capabilities

## Impact

- `packages/cli` — new `--dev-container` flag on the run command; after container start, prints connection instructions then interactively prompts the user; if VSCode launch is confirmed, constructs and executes the `attached-container` URI using `Buffer` hex encoding; creates `.mason/docker/vscode-server/` directory during setup
- `packages/agent-entry` — new `cred-fetch` subcommand outputs shell exports; `server-env-setup` is written once to the persistent mount (static content, never session-specific); agent runtime spawned in background in dev-container mode
- `packages/packager` (or equivalent Dockerfile build step) — reads `dev-container-customizations` from agent config (falling back to the default), JSON-serializes it, and injects a `LABEL devcontainer.metadata` instruction into the agent's Dockerfile template at build time
- `.mason/config.json` agent schema — new optional `dev-container-customizations` field; type-checked against the schema with a default applied when absent
- `docker-compose.yml` (dev-container variant) — adds volume mount `{projectDir}/.mason/docker/vscode-server:/home/mason/.vscode-server` to the agent service
- No runtime `devcontainer.json` is written; the Dockerfile `LABEL` is the sole source of dev-container metadata
