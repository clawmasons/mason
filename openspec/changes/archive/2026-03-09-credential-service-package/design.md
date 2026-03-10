## Context

The credential service package (`@clawmasons/credential-service`) already has a `CredentialResolver` class (CHANGE 2) that resolves credentials from env/keychain/dotenv. This change adds the service layer on top: access validation, audit logging, WebSocket client, and a CLI entrypoint.

The existing proxy package (`@clawmasons/proxy`) uses `better-sqlite3` with a `chapter.db` database that has `audit_log` and `approval_requests` tables. The credential service will follow the same pattern but with its own `credential_audit` table.

## Goals / Non-Goals

**Goals:**
- CredentialService class usable in SDK mode (in-process, no WebSocket)
- Access validation: check requested credential key against agent's declared credentials list
- Audit logging to SQLite with outcome tracking
- WebSocket client with reconnect logic for production Docker deployment
- CLI entrypoint for standalone container operation

**Non-Goals:**
- Session token validation (that's the proxy's responsibility in CHANGE 4)
- Cryptographic signing (Phase 2)
- Integration with the proxy's WebSocket server (CHANGE 4)

## Decisions

### Decision 1: Credential audit in a separate database instance

**Choice**: The credential service opens its own database instance (defaulting to the same `chapter.db` path) and creates a `credential_audit` table. It does not import from `@clawmasons/proxy`.

**Rationale**: The credential service is a separate package. Importing from proxy would create a circular dependency risk. The `openDatabase` pattern from proxy is simple enough to replicate. In production, both the proxy and credential service may share the same SQLite file (WAL mode handles concurrent access).

### Decision 2: Access validation uses `declaredCredentials` array in request

**Choice**: The credential request includes a `declaredCredentials` field — the agent's full list of allowed credential keys. The service checks if the requested `key` is in this list.

**Rationale**: The credential service doesn't have access to the agent's `chapter.json` directly. The proxy (CHANGE 4) will populate `declaredCredentials` from the resolved agent metadata when forwarding requests. This keeps the credential service stateless with respect to agent configuration.

### Decision 3: WebSocket client uses native `ws` library

**Choice**: Use the `ws` npm package for WebSocket client connections.

**Rationale**: Standard, well-maintained WebSocket library for Node.js. Already used by `@modelcontextprotocol/sdk` (transitive dependency). The client connects to the proxy's WebSocket endpoint.

### Decision 4: Reconnect with bounded retries

**Choice**: WebSocket client retries 3 times with 1-second backoff on connection failure, then exits.

**Rationale**: Matches the error handling pattern from the PRD (REQ-005). In Docker, container restart policies handle longer-term recovery.

## Risks / Trade-offs

- [Risk] SQLite concurrent access from proxy and credential-service containers → WAL mode handles this; both are in the same Docker network with shared volume
- [Trade-off] `declaredCredentials` in every request is redundant data → Keeps service stateless; the proxy is authoritative for agent metadata
- [Trade-off] Separate db.ts instead of shared module → Avoids cross-package dependency; small code duplication is acceptable
