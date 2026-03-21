## Context

Changes 1-7 established all the host-side components: `RelayClient` (Change 3), `CredentialService`/`CredentialResolver` (Change 4), `CredentialRelayHandler` (Change 5), `AuditWriter` (Change 6), and `ApprovalHandler` (Change 7). Each is a standalone module with its own constructor and lifecycle. The `HostProxy` class orchestrates them into a single entry point.

The pattern is straightforward: create instances, wire handlers onto the relay client, connect, and on stop, tear down in reverse order. The host proxy is a pure WebSocket client — no HTTP server, no port listening.

## Goals / Non-Goals

**Goals:**
- `HostProxy` provides a single `start()`/`stop()` lifecycle for all host-side services
- `HostProxyConfig` is the only configuration surface the CLI needs to provide
- All three relay message types (`credential_request`, `approval_request`, `audit_event`) are handled
- Clean shutdown: disconnect relay, close audit writer, close credential service
- Full test coverage for lifecycle, handler wiring, and shutdown

**Non-Goals:**
- CLI integration (Change 9)
- Host MCP server lifecycle (Change 11) — `HostProxy` will be extended later
- Reconnection logic (REQ-014 / P1)
- Logging framework integration

## Decisions

### D1: HostProxyConfig is a flat config object

**Choice:** A single `HostProxyConfig` interface with all needed fields: `relayUrl`, `token`, `envFilePath`, `keychainService`, `auditFilePath`. All optional except `relayUrl` and `token`.

**Rationale:** The CLI constructs the config from its own context (relay URL from Docker compose, token from generated secrets, env file from workspace). A flat config avoids nested config objects that would require the CLI to understand each sub-service's config type.

### D2: Services are created in start(), not the constructor

**Choice:** The constructor only stores config. `start()` creates all service instances and connects.

**Rationale:** This avoids partially-initialized states. If any step fails during `start()`, the caller gets a rejected promise and knows the proxy is not running. It also makes `stop()` + `start()` (restart) possible without recreating the object.

### D3: audit_event handler is wired directly (no separate handler class)

**Choice:** Unlike credentials and approvals which have dedicated handler classes (`CredentialRelayHandler`, `ApprovalHandler`), the audit_event handler is a simple inline function that calls `AuditWriter.write()`.

**Rationale:** The audit flow is fire-and-forget — no response is sent back. A dedicated class would add ceremony for a one-line handler. If audit handling becomes more complex (e.g., batching, filtering), a class can be extracted later.

### D4: stop() is idempotent

**Choice:** Calling `stop()` multiple times is safe — subsequent calls are no-ops.

**Rationale:** During error handling or shutdown sequences, `stop()` may be called defensively. Idempotent shutdown prevents double-close errors.

## Module Changes

### `packages/proxy/src/host-proxy.ts` (New)

```typescript
export interface HostProxyConfig {
  /** WebSocket URL for the Docker proxy's relay endpoint. */
  relayUrl: string;
  /** Bearer token for relay authentication. */
  token: string;
  /** Path to .env file for credential resolution. Optional. */
  envFilePath?: string;
  /** macOS Keychain service name. Optional, defaults to "clawmasons". */
  keychainService?: string;
  /** Path for JSONL audit log. Optional, defaults to ~/.mason/data/audit.jsonl. */
  auditFilePath?: string;
}

export class HostProxy {
  constructor(config: HostProxyConfig)
  start(): Promise<void>
  stop(): Promise<void>
  isConnected(): boolean
}
```

**Internal wiring in `start()`:**
1. Create `CredentialResolver` with `envFilePath` and `keychainService`
2. Create `CredentialService` with resolver
3. Create `AuditWriter` with `auditFilePath`
4. Create `RelayClient` with `relayUrl` and `token`
5. Create `CredentialRelayHandler(relayClient, credentialService)` and call `.register()`
6. Create `ApprovalHandler(relayClient)` and call `.register()`
7. Register inline `audit_event` handler on relayClient that calls `auditWriter.write()`
8. Call `relayClient.connect()`

**Internal wiring in `stop()`:**
1. Disconnect `relayClient`
2. Close `auditWriter`
3. Close `credentialService`
4. Null out all references

### `packages/proxy/src/index.ts` (Modify)

Add exports:
```typescript
export { HostProxy } from "./host-proxy.js";
export type { HostProxyConfig } from "./host-proxy.js";
```

## Test Coverage

### `packages/proxy/tests/host-proxy.test.ts` (New)

Tests will use a mock WebSocket server (same pattern as `relay/client.test.ts`).

1. **Lifecycle tests:**
   - `start()` connects to relay server
   - `stop()` disconnects from relay server
   - `stop()` is idempotent (calling twice doesn't throw)
   - `isConnected()` returns true after start, false after stop

2. **Handler registration tests:**
   - After `start()`, credential_request messages are handled (send credential_request, verify credential_response is received)
   - After `start()`, approval_request messages are handled (mock dialog, verify approval_response)
   - After `start()`, audit_event messages are written to file

3. **Shutdown cleanup tests:**
   - After `stop()`, audit writer is closed
   - After `stop()`, credential service is closed
   - After `stop()`, relay client is disconnected

## Interaction with Future Changes

- **Change 9 (CLI Integration):** Will create `HostProxy` instances in `run-agent.ts` and `session.ts`.
- **Change 11 (Host MCP Server Lifecycle):** Will extend `HostProxy` to accept `hostApps: ResolvedApp[]` and start host MCP servers.
- **Change 12 (Host MCP Tool Routing):** Will add `mcp_tool_call` handler to `HostProxy`.
