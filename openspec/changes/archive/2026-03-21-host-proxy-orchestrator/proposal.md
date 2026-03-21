## Why

The host-side components — `RelayClient`, `CredentialService`/`CredentialRelayHandler`, `ApprovalHandler`, and `AuditWriter` — exist as independent modules with no unified entry point. The CLI currently has no single class to instantiate for host-side operation. Without an orchestrator, the CLI would need to manually wire up each service, manage their lifecycles, and coordinate shutdown — duplicating this logic wherever the host proxy is needed (run-agent, ACP sessions).

This change creates the `HostProxy` class that combines all host-side services into a single `start()`/`stop()` entry point. The host proxy is purely a client — it does not listen on any port. It connects to the Docker proxy's `/ws/relay` endpoint and handles credential requests, approval dialogs, and audit event persistence on behalf of the operator.

## What Changes

- New `packages/proxy/src/host-proxy.ts` — `HostProxy` class with `HostProxyConfig` interface.
  - `constructor(config: HostProxyConfig)` — accepts relay URL, token, env file path, keychain service, optional audit file path.
  - `start(): Promise<void>` — initializes `CredentialService` + `CredentialResolver`, `AuditWriter`, `ApprovalHandler`, `CredentialRelayHandler`, wires audit_event handler, connects `RelayClient`.
  - `stop(): Promise<void>` — disconnects relay, closes audit writer, closes credential service.
- Modify `packages/proxy/src/index.ts` — export `HostProxy` and `HostProxyConfig`.
- New `packages/proxy/tests/host-proxy.test.ts` — lifecycle tests: start/stop, handler registration, shutdown cleanup.

## Capabilities

### New Capabilities
- `host-proxy`: Unified orchestrator class for all host-side relay services.

### Modified Capabilities
- `proxy-exports`: `index.ts` exports the new `HostProxy` class and config type.

## Impact

- **No breaking changes** — this is a new additive class. No existing code is modified except `index.ts` exports.
- **No existing tests affected** — all existing modules continue to work independently.
- Future Change 9 (CLI Integration) will replace `defaultStartCredentialService()` with `defaultStartHostProxy()` using this class.

## Dependencies

- Change 3 (RelayClient) — `HostProxy` creates and manages a `RelayClient`.
- Change 4 (Credential Service in Proxy) — `HostProxy` creates `CredentialService` and `CredentialResolver`.
- Change 5 (Credential Requests via Relay) — `HostProxy` creates `CredentialRelayHandler` to wire credential requests.
- Change 6 (Audit Events via Relay) — `HostProxy` creates `AuditWriter` and wires `audit_event` handler.
- Change 7 (Approvals via Relay) — `HostProxy` creates `ApprovalHandler` and wires approval handling.
