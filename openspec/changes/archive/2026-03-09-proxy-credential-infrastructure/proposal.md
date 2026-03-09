## Why

The proxy needs to serve as the central relay between agents and the credential service. Currently, the credential service package (CHANGE 3) has a WebSocket client and service logic, but the proxy has no way to: (1) authenticate agents and issue session tokens, (2) accept the credential service's WebSocket connection, or (3) expose a `credential_request` MCP tool for agents to call. Without these three capabilities, the credential pipeline cannot function end-to-end.

## What Changes

- Add `POST /connect-agent` endpoint to the proxy — accepts `MCP_PROXY_TOKEN` in Authorization header, generates and returns an `AGENT_SESSION_TOKEN` + `session_id`. Stores active sessions in an in-memory `SessionStore`.
- Add `GET /ws/credentials` WebSocket endpoint — accepts credential service connections authenticated with `CREDENTIAL_PROXY_TOKEN`. Only one credential service connection per proxy instance.
- Register `credential_request` as an internal MCP tool — when an agent calls it with `{ key, session_token }`, the proxy validates the session token, forwards the request over WebSocket to the credential service, and returns the response.

### New Capabilities
- `proxy-connect-agent`: HTTP endpoint for agent session establishment
- `proxy-credential-relay`: WebSocket server for credential service + MCP tool handler

### Modified Capabilities
- `proxy-server`: Extended with new routes and credential relay integration

## Impact

- New: `packages/proxy/src/handlers/connect-agent.ts`
- New: `packages/proxy/src/handlers/credential-relay.ts`
- Modified: `packages/proxy/src/server.ts` — add routes and credential relay wiring
- Modified: `packages/proxy/src/index.ts` — export new types
- Modified: `packages/proxy/package.json` — add `ws` dependency
- New: `packages/proxy/tests/handlers/connect-agent.test.ts`
- New: `packages/proxy/tests/handlers/credential-relay.test.ts`
