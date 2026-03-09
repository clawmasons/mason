# Proxy Credential Infrastructure

The proxy's credential infrastructure provides three capabilities: (1) agent session establishment via `/connect-agent`, (2) credential service WebSocket relay via `/ws/credentials`, and (3) the `credential_request` internal MCP tool.

## Requirements

### Requirement: POST /connect-agent authenticates agents and issues session tokens

The proxy SHALL expose a `POST /connect-agent` endpoint that authenticates the requesting agent using `MCP_PROXY_TOKEN` (Bearer auth) and returns a new `AGENT_SESSION_TOKEN` and `session_id`. The session is stored in an in-memory `SessionStore`.

#### Scenario: Valid authentication
- **WHEN** a POST request to `/connect-agent` includes `Authorization: Bearer <MCP_PROXY_TOKEN>` with a valid token
- **THEN** the proxy returns 200 with `{ sessionToken, sessionId }`
- **AND** a session entry is stored in the `SessionStore`

#### Scenario: Missing authorization
- **WHEN** a POST request to `/connect-agent` has no Authorization header
- **THEN** the proxy returns 401 with `{ error: "Unauthorized" }`

#### Scenario: Invalid token
- **WHEN** a POST request to `/connect-agent` includes an invalid Bearer token
- **THEN** the proxy returns 401 with `{ error: "Unauthorized" }`

#### Scenario: Wrong HTTP method
- **WHEN** a GET request is sent to `/connect-agent`
- **THEN** the proxy returns 405 with `{ error: "Method not allowed" }`

#### Scenario: Multiple connections
- **WHEN** two valid POST requests are sent to `/connect-agent`
- **THEN** each receives a unique `sessionToken` and `sessionId`

### Requirement: SessionStore provides in-memory session tracking

The `SessionStore` class SHALL store active sessions in memory with O(1) lookup by both session ID and session token. Each session entry contains `sessionId`, `sessionToken`, `agentId`, `role`, and `connectedAt`.

#### Scenario: Create and lookup by token
- **GIVEN** a session created with `store.create("agent-a", "role-a")`
- **WHEN** `store.getByToken(sessionToken)` is called with the returned token
- **THEN** the matching session entry is returned

#### Scenario: Lookup unknown token
- **WHEN** `store.getByToken("nonexistent")` is called
- **THEN** `undefined` is returned

### Requirement: Risk-based connection limits enforce session locking for HIGH/MEDIUM risk roles

The `SessionStore` SHALL accept a `riskLevel` parameter at construction (defaulting to `"LOW"`). When the risk level is `HIGH` or `MEDIUM`, the store locks after the first agent connection — `isLocked()` returns true and subsequent `handleConnectAgent` calls are rejected with 403.

#### Scenario: HIGH risk — first connection succeeds
- **GIVEN** a `SessionStore` with `riskLevel: "HIGH"`
- **WHEN** the first `POST /connect-agent` request arrives with valid auth
- **THEN** the proxy returns 200 with `{ sessionToken, sessionId }`

#### Scenario: HIGH risk — second connection rejected
- **GIVEN** a `SessionStore` with `riskLevel: "HIGH"` and one existing connection
- **WHEN** a second `POST /connect-agent` request arrives with valid auth
- **THEN** the proxy returns 403 with `{ error: "Session locked — HIGH risk role does not allow additional agent connections" }`

#### Scenario: MEDIUM risk — second connection rejected
- **GIVEN** a `SessionStore` with `riskLevel: "MEDIUM"` and one existing connection
- **WHEN** a second `POST /connect-agent` request arrives with valid auth
- **THEN** the proxy returns 403 with `{ error: "Session locked — MEDIUM risk role does not allow additional agent connections" }`

#### Scenario: LOW risk — unlimited connections allowed
- **GIVEN** a `SessionStore` with `riskLevel: "LOW"` and one existing connection
- **WHEN** a second `POST /connect-agent` request arrives with valid auth
- **THEN** the proxy returns 200 with `{ sessionToken, sessionId }`

#### Scenario: Default risk level behaves as LOW
- **GIVEN** a `SessionStore` created with no risk level argument
- **WHEN** multiple `POST /connect-agent` requests arrive with valid auth
- **THEN** all connections succeed (unlimited)

### Requirement: GET /ws/credentials accepts credential service WebSocket connections

The proxy SHALL accept WebSocket upgrade requests at `GET /ws/credentials`, authenticated with `CREDENTIAL_PROXY_TOKEN` (Bearer auth). Only one credential service connection is allowed per proxy instance. A new connection replaces any existing one.

#### Scenario: Valid credential service connection
- **WHEN** a WebSocket upgrade request to `/ws/credentials` includes a valid `CREDENTIAL_PROXY_TOKEN`
- **THEN** the connection is accepted and the credential service is marked as connected

#### Scenario: Invalid token
- **WHEN** a WebSocket upgrade request to `/ws/credentials` includes an invalid token
- **THEN** the connection is rejected with 401

#### Scenario: Connection replacement
- **WHEN** a second credential service connects while one is already connected
- **THEN** the first connection is closed and the second becomes the active connection

### Requirement: credential_request is registered as an internal MCP tool

When `credentialProxyToken` is configured, the proxy SHALL include `credential_request` in the tool list returned by `tools/list`. This tool is not from any upstream MCP server.

#### Scenario: Tool appears in list when configured
- **WHEN** `credentialProxyToken` is set in server config
- **AND** a client calls `tools/list`
- **THEN** the returned tools include `credential_request` with input schema requiring `key` and `session_token`

#### Scenario: Tool does not appear when not configured
- **WHEN** `credentialProxyToken` is not set in server config
- **AND** a client calls `tools/list`
- **THEN** `credential_request` is not in the returned tools

### Requirement: credential_request tool validates session and relays to credential service

When an agent calls `credential_request` with `{ key, session_token }`, the proxy SHALL:
1. Validate the session token against the `SessionStore`
2. Forward the request to the credential service over WebSocket
3. Wait for the response (with configurable timeout, default 30s)
4. Return the resolved credential value or error

#### Scenario: Successful credential request
- **GIVEN** a valid session token and a connected credential service
- **WHEN** `credential_request` is called with `{ key: "API_KEY", session_token: "<valid>" }`
- **THEN** the proxy forwards `{ id, key, agentId, role, sessionId, declaredCredentials }` to the credential service
- **AND** returns the resolved `{ key, value }` to the agent

#### Scenario: Invalid session token
- **WHEN** `credential_request` is called with an invalid `session_token`
- **THEN** the tool returns an error: "Invalid session token"

#### Scenario: Credential service not connected
- **GIVEN** no credential service is connected
- **WHEN** `credential_request` is called with a valid session token
- **THEN** the tool returns an error: "Credential service not connected"

#### Scenario: Request timeout
- **GIVEN** a connected credential service that does not respond
- **WHEN** `credential_request` is called
- **THEN** after the timeout period, the tool returns an error: "Credential request timed out"

#### Scenario: Missing arguments
- **WHEN** `credential_request` is called without `key` or `session_token`
- **THEN** the tool returns an error: "Missing required arguments: key, session_token"

### Requirement: CredentialRelay uses request ID correlation

Each credential request forwarded to the credential service SHALL include a unique `id` field (UUID). The response from the credential service SHALL include the same `id` field. The relay uses a pending request map to match responses to requests.

#### Scenario: Request-response correlation
- **GIVEN** a pending credential request with ID "abc-123"
- **WHEN** the credential service sends a response with `{ id: "abc-123", key: "KEY", value: "val" }`
- **THEN** the pending request resolves with `{ key: "KEY", value: "val" }`

### Requirement: ChapterProxyServer stop() closes credential relay

When `stop()` is called, the proxy SHALL close the credential relay, including any active WebSocket connection and pending requests.

#### Scenario: Graceful shutdown with credential relay
- **WHEN** `stop()` is called on a proxy with an active credential relay
- **THEN** the credential service WebSocket is closed
- **AND** all pending credential requests are rejected
