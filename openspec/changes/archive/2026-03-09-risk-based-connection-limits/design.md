## Context

The proxy's `connect-agent` handler (CHANGE 4) creates agent sessions but does not enforce any connection limits. The PRD (REQ-016) requires that HIGH and MEDIUM risk roles allow only one agent connection per proxy session. The `risk` field already exists on the role schema (CHANGE 1).

The proxy receives the role's risk level at startup via its config. When an agent connects, the handler checks the risk level and, for HIGH/MEDIUM roles, ensures only the first connection succeeds. This is a session-level lock — once an agent has connected to a HIGH/MEDIUM risk session, the session is "locked" and no more agents can connect.

## Goals / Non-Goals

**Goals:**
- `SessionStore` tracks locked state and risk level per session
- `handleConnectAgent` rejects additional connections for HIGH/MEDIUM risk roles with 403
- LOW risk roles allow unlimited connections (existing behavior preserved)
- The risk level is passed from server config to the handler

**Non-Goals:**
- Audit logging of connection rejections to the credential_audit table (the handler returns 403, upstream callers can log)
- Dynamic risk level changes during a session
- Per-agent connection limits (this is per-session/proxy-instance)

## Decisions

### Decision 1: Session locking is tracked in SessionStore via a connection counter

**Choice**: Add `agentConnectionCount: number` and `riskLevel` to SessionStore's state (not per-session, but per-store since there's one proxy per agent-role). When `riskLevel` is HIGH/MEDIUM and `agentConnectionCount > 0`, reject new connections.

**Rationale**: The proxy runs one instance per agent-role pair. The session store already tracks all sessions for this proxy. A simple counter at the store level is cleaner than per-session locking since the PRD says "per proxy session" — meaning the entire proxy instance is locked after the first agent connects.

### Decision 2: Risk level is a store-level property, not per-session

**Choice**: Set `riskLevel` on the `SessionStore` at construction time, not per individual session.

**Rationale**: A single proxy instance serves one agent-role pair. The risk level is determined by the role, which is known at proxy startup. There's no scenario where different sessions within the same proxy have different risk levels.

### Decision 3: 403 response with "session locked" message

**Choice**: Return HTTP 403 with `{ error: "Session locked — HIGH/MEDIUM risk role does not allow additional agent connections" }`.

**Rationale**: 403 Forbidden is semantically correct — the client is authenticated (they passed the proxy token check) but not authorized to perform this action. The error message is descriptive enough for debugging.

## Risks / Trade-offs

- [Trade-off] Store-level locking vs per-session locking: Store-level is simpler but assumes one role per proxy, which matches the current architecture. If multi-role proxies are added later, this would need refactoring.
- [Risk] Race condition if two agents connect simultaneously: The handler is synchronous (no awaits between check and create), so this is safe in Node.js's single-threaded model.
