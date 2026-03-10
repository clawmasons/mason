# Agent Entry Package

The agent-entry package (`@clawmasons/agent-entry`) is a standalone esbuild-bundled entrypoint for agent Docker containers. It bootstraps the agent by authenticating with the proxy, retrieving credentials via the `credential_request` MCP tool, and launching the agent runtime with credentials injected into the child process environment only.

## Requirements

### Requirement: agent-entry bundles into a single standalone JavaScript file

The package SHALL build with esbuild into a single `.js` file (`dist/agent-entry.js`) that runs with Node.js and requires no `node_modules` directory.

#### Scenario: Build produces single file
- **WHEN** `npm run build` is executed in the agent-entry package
- **THEN** `dist/agent-entry.js` is produced as a single bundled ESM file targeting node22

#### Scenario: Bundle runs standalone
- **WHEN** the bundled file is executed with `node dist/agent-entry.js` without any `node_modules`
- **THEN** it starts without import errors (exits with appropriate error if env vars are missing)

### Requirement: agent-entry reads configuration from environment variables

The entrypoint SHALL read all configuration from environment variables:
- `MCP_PROXY_TOKEN` — proxy authentication token (required)
- `MCP_PROXY_URL` — proxy URL (default: `http://proxy:3000`)
- `AGENT_CREDENTIALS` — JSON array of credential keys to request (default: `[]`)
- `AGENT_RUNTIME_CMD` — command to run as the agent runtime (required)

#### Scenario: Missing MCP_PROXY_TOKEN
- **WHEN** agent-entry starts without `MCP_PROXY_TOKEN` set
- **THEN** it exits with code 1 and prints "[agent-entry] MCP_PROXY_TOKEN not set"

#### Scenario: Missing AGENT_RUNTIME_CMD
- **WHEN** agent-entry starts without `AGENT_RUNTIME_CMD` set
- **THEN** it exits with code 1 and prints "[agent-entry] AGENT_RUNTIME_CMD not set"

#### Scenario: Invalid AGENT_CREDENTIALS
- **WHEN** `AGENT_CREDENTIALS` is set to a non-JSON-array value
- **THEN** it exits with code 1 and prints "[agent-entry] AGENT_CREDENTIALS must be a JSON array of strings"

### Requirement: connectToProxy authenticates with the proxy and receives a session token

The `connectToProxy(proxyUrl, token)` function SHALL POST to `/connect-agent` with a Bearer token and return `{ sessionToken, sessionId }`.

#### Scenario: Valid authentication
- **WHEN** `connectToProxy` is called with a valid proxy URL and token
- **THEN** it returns `{ sessionToken, sessionId }` from the proxy response

#### Scenario: Invalid token
- **WHEN** `connectToProxy` is called with an invalid token
- **THEN** it throws an error with message "authentication failed"

#### Scenario: Proxy unreachable with retries
- **WHEN** `connectToProxy` is called and the proxy is unreachable
- **THEN** it retries 3 times with 1-second backoff between attempts
- **AND** after all retries fail, it throws an error

#### Scenario: Session locked (403)
- **WHEN** `connectToProxy` receives a 403 response (session locked for HIGH/MEDIUM risk)
- **THEN** it throws immediately without retrying

### Requirement: requestCredentials retrieves credentials via the credential_request MCP tool

The `requestCredentials(proxyUrl, proxyToken, sessionToken, keys)` function SHALL initialize an MCP session with the proxy and call `credential_request` for each credential key.

#### Scenario: All credentials retrieved successfully
- **GIVEN** the proxy has the `credential_request` tool available
- **WHEN** `requestCredentials` is called with valid keys `["API_KEY", "DB_PASSWORD"]`
- **THEN** it returns `{ API_KEY: "value1", DB_PASSWORD: "value2" }`

#### Scenario: Empty keys array
- **WHEN** `requestCredentials` is called with an empty array
- **THEN** it returns `{}` without making any MCP calls

#### Scenario: Credential not found
- **WHEN** `requestCredentials` is called with a key that doesn't exist
- **THEN** it throws an error containing "Credential retrieval failed" and the missing key

#### Scenario: Invalid session token
- **WHEN** `requestCredentials` is called with an invalid session token
- **THEN** it throws an error containing "Credential retrieval failed"

### Requirement: launchRuntime spawns the child process with credentials in its environment only

The `launchRuntime(command, args, credentialEnv)` function SHALL spawn the child process using `child_process.spawn` with an explicit `env` option containing credentials. Credentials MUST NOT be set on the parent (agent-entry) process.

#### Scenario: Child receives credentials
- **WHEN** `launchRuntime` is called with `{ TEST_CRED: "secret" }` in credentialEnv
- **THEN** the child process has `TEST_CRED=secret` in its environment

#### Scenario: Parent process does not have credentials
- **WHEN** `launchRuntime` is called with credentials
- **THEN** `process.env` in the agent-entry process does NOT contain those credentials

#### Scenario: Sensitive tokens filtered from child env
- **WHEN** `launchRuntime` is called and `MCP_PROXY_TOKEN` is in the parent env
- **THEN** the child process does NOT have `MCP_PROXY_TOKEN` in its environment

#### Scenario: Parent env vars pass through (non-sensitive)
- **WHEN** `launchRuntime` is called and a non-sensitive env var exists in the parent
- **THEN** the child process inherits that env var

### Requirement: launchRuntime redirects stdio and propagates exit code

The child process SHALL inherit stdin/stdout/stderr from the container process via `stdio: 'inherit'`. The child's exit code SHALL be propagated as agent-entry's exit code.

#### Scenario: Child stdout visible on container stdout
- **WHEN** the child process writes to stdout
- **THEN** the output appears on the container's stdout

#### Scenario: Exit code propagation
- **WHEN** the child process exits with code N
- **THEN** `launchRuntime` resolves with N

#### Scenario: Command not found
- **WHEN** `launchRuntime` is called with a non-existent command
- **THEN** it rejects with "Failed to launch runtime" error

### Requirement: MCP client initializes session and calls tools via Streamable HTTP

The lightweight MCP client (`mcp-client.ts`) SHALL implement MCP Streamable HTTP transport for calling tools on the proxy. It sends JSON-RPC requests via POST to the proxy's `/mcp` endpoint.

#### Scenario: Initialize MCP session
- **WHEN** `initializeMcpSession` is called with a valid proxy URL and token
- **THEN** it sends an `initialize` JSON-RPC request and receives an `mcp-session-id`
- **AND** it sends a `notifications/initialized` notification

#### Scenario: Call credential_request tool
- **WHEN** `callTool` is called with tool name `credential_request` and args `{ key, session_token }`
- **THEN** it sends a `tools/call` JSON-RPC request with the correct params
- **AND** returns the tool result content
