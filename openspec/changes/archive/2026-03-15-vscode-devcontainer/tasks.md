## 1. Config Schema

- [x] 1.1 Add `dev-container-customizations` optional field to the `.mason/config.json` agent schema with TypeScript type definition
- [x] 1.2 Define the default customizations constant (7 extensions + bash terminal setting) used when the field is absent

## 2. Packager — Dockerfile Label Injection

- [x] 2.1 Read `dev-container-customizations` from agent config (or apply default) in the Dockerfile build step
- [x] 2.2 Compact JSON-serialize the resolved customizations object
- [x] 2.3 Construct the `devcontainer.metadata` label value: `[{"remoteUser":"mason","workspaceFolder":"/workspace/project","customizations":<json>}]`
- [x] 2.4 Inject the `LABEL devcontainer.metadata='...'` instruction into the agent Dockerfile template at build time

## 3. `agent-entry cred-fetch` Subcommand

- [x] 3.1 Add `cred-fetch` subcommand to `agent-entry` CLI
- [x] 3.2 Read `MCP_PROXY_TOKEN`, `MCP_PROXY_URL`, and `AGENT_CREDENTIALS` from the container environment
- [x] 3.3 Connect to the credential proxy and request all declared credentials
- [x] 3.4 Print results to stdout as `export KEY="value"` lines
- [x] 3.5 Exit non-zero with a descriptive stderr message when required env vars are missing

## 4. CLI — `--dev-container` Flag

- [x] 4.1 Add `--dev-container` boolean flag to the `mason run` command
- [x] 4.2 Ensure the flag is additive — no change to existing behavior when absent

## 5. CLI — Pre-start Setup

- [x] 5.1 Before docker compose up, create `.mason/docker/vscode-server/` if it does not exist
- [x] 5.2 Write static `server-env-setup` file (`eval "$(agent-entry cred-fetch)"`) to the vscode-server directory if not already present with correct content
- [x] 5.3 Add the vscode-server volume mount to the dev-container docker-compose variant: `{projectDir}/.mason/docker/vscode-server:/home/mason/.vscode-server`

## 6. CLI — Post-start Connection Instructions & VSCode Prompt

- [x] 6.1 After containers are healthy, print IDE connection instructions including container name and workspace path
- [x] 6.2 Prompt the user interactively: "Would you like to launch VSCode and attach to the container? (y/N)"
- [x] 6.3 If user confirms, check if `code` is available on PATH; print error and continue if not found
- [x] 6.4 Construct the `attached-container` URI: JSON-encode `{"containerName":"/<name>"}`, hex-encode with `Buffer.from(...).toString('hex')`, form `vscode-remote://attached-container+<hex>/workspace/project`
- [x] 6.5 Spawn `code --folder-uri "<uri>"` as a detached child process
- [x] 6.6 Keep mason running after the prompt (regardless of user choice) and handle Ctrl+C to tear down the session

## 7. Tests

- [x] 7.1 Unit test: `dev-container-customizations` default applied when field absent from agent config
- [x] 7.2 Unit test: Dockerfile label constructed with correct compact JSON from resolved customizations
- [x] 7.3 Unit test: `attached-container` URI hex encoding produces correct output for a known container name
- [x] 7.4 Unit test: `--dev-container` flag parsed correctly by `mason run`
- [x] 7.5 Unit test: `server-env-setup` not overwritten if file already exists with correct content
- [x] 7.6 Unit test: `agent-entry cred-fetch` exits non-zero when `MCP_PROXY_TOKEN` is missing
