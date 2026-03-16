## ADDED Requirements

### Requirement: `agent-entry cred-fetch` subcommand
The `agent-entry` binary SHALL expose a `cred-fetch` subcommand. When invoked, it SHALL read `MCP_PROXY_TOKEN`, `MCP_PROXY_URL`, and `AGENT_CREDENTIALS` from the container environment (set by docker-compose), connect to the credential proxy, request all declared credentials, and print the results to stdout as shell export statements.

#### Scenario: Credentials fetched and printed as shell exports
- **WHEN** `agent-entry cred-fetch` is invoked inside the container with valid env vars set
- **THEN** the command prints one or more lines of the form `export KEY="value"` to stdout and exits 0

#### Scenario: Missing environment variable — exits with error
- **WHEN** `agent-entry cred-fetch` is invoked and `MCP_PROXY_TOKEN` or `MCP_PROXY_URL` is missing
- **THEN** the command exits non-zero and prints a descriptive error to stderr

---

### Requirement: Static `server-env-setup` written to persistent VS Code Server mount
Mason SHALL write a static `server-env-setup` file to `.mason/docker/vscode-server/` on the host before starting docker compose. The file content SHALL be exactly:

```sh
eval "$(agent-entry cred-fetch)"
```

The file SHALL be written once; if it already exists with the correct content, it SHALL NOT be overwritten. No session-specific values (tokens, URLs) SHALL be written into this file.

#### Scenario: `server-env-setup` written on first dev-container session
- **WHEN** `mason run --dev-container` is invoked and `server-env-setup` does not exist in the vscode-server directory
- **THEN** mason writes the static file before starting docker compose

#### Scenario: `server-env-setup` not overwritten if already correct
- **WHEN** `mason run --dev-container` is invoked and `server-env-setup` already exists with the correct content
- **THEN** mason does not modify the file

#### Scenario: VS Code Server sources credentials on terminal start
- **WHEN** VS Code Server starts a new terminal or task inside the container
- **THEN** `server-env-setup` is sourced, `agent-entry cred-fetch` runs, and credential exports are available in the shell environment
