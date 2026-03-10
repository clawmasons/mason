## Why

The proxy currently allows unlimited agent connections per session. For HIGH and MEDIUM risk roles (e.g., roles with access to financial APIs or PII), a compromised agent could spawn sub-agents that connect to the same proxy, inheriting elevated access. There is no mechanism to prevent privilege escalation through additional agent connections.

## What Changes

- Extend `SessionStore` with `locked` (boolean) and `riskLevel` ("HIGH" | "MEDIUM" | "LOW") fields
- Modify `handleConnectAgent` to accept a `riskLevel` parameter and enforce connection limits:
  - HIGH/MEDIUM: after the first agent connects, the session is locked; subsequent connections are rejected with 403
  - LOW: unlimited connections allowed
- Update `server.ts` to pass the resolved role risk level to `handleConnectAgent`

### Modified Capabilities
- `proxy-connect-agent`: Extended with risk-based connection limiting
- `proxy-server`: Passes risk level configuration to connect-agent handler

## Impact

- Modified: `packages/proxy/src/handlers/connect-agent.ts` — SessionStore gains `locked`/`riskLevel`, handler gains risk checking
- Modified: `packages/proxy/src/server.ts` — pass `riskLevel` config to handler
- Modified: `packages/proxy/tests/handlers/connect-agent.test.ts` — risk-based test cases
