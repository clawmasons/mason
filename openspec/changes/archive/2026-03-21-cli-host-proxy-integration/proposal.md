## Why

The CLI currently starts a standalone `CredentialService` + `CredentialWSClient` pair in `defaultStartCredentialService()` to handle credential resolution. This connects over the old `/ws/credentials` endpoint. With the relay protocol (Changes 1-8), all host-to-Docker communication flows through a single `/ws/relay` WebSocket. The `HostProxy` class (Change 8) already orchestrates credential resolution, approval handling, and audit writing over the relay — but the CLI still uses the old code path.

This change replaces `defaultStartCredentialService()` with `defaultStartHostProxy()` across all CLI entry points (run-agent interactive, dev-container, ACP mode), updates Docker Compose env vars from `CREDENTIAL_PROXY_TOKEN` to `RELAY_TOKEN`, and updates `proxy.ts`/`proxy-entry.ts` to work with the relay-based proxy startup.

## What Changes

- **`packages/cli/src/cli/commands/run-agent.ts`**:
  - Replace import of `CredentialService, CredentialWSClient` with `HostProxy` from `@clawmasons/proxy`.
  - Replace `defaultStartCredentialService()` with `defaultStartHostProxy()` that creates and starts a `HostProxy` instance.
  - Update `RunAgentDeps.startCredentialServiceFn` to `startHostProxyFn` with matching signature.
  - Update all call sites in `runAgent()`, `runDevContainer()`, and ACP `runAcpAgent()` to use the new function.
  - Update console log messages from "credential service" to "host proxy".

- **`packages/cli/src/acp/session.ts`**:
  - Rename `credentialProxyToken` to `relayToken` in `InfrastructureInfo`.
  - Update `generateAcpComposeYml()` to emit `RELAY_TOKEN` instead of `CREDENTIAL_PROXY_TOKEN`.

- **`packages/cli/src/materializer/docker-generator.ts`**:
  - Rename `credentialProxyToken` to `relayToken` in `SessionComposeOptions`, `SessionResult`, `CreateSessionOptions`.
  - Update `generateSessionComposeYml()` to emit `RELAY_TOKEN` instead of `CREDENTIAL_PROXY_TOKEN`.

- **`packages/cli/src/cli/commands/proxy.ts`**:
  - Already reads `RELAY_TOKEN` with `CREDENTIAL_PROXY_TOKEN` fallback — no change needed.

- **`packages/cli/src/cli/proxy-entry.ts`**:
  - Already delegates to `startProxy()` — no change needed.

- **Tests**: Update all test references to `CREDENTIAL_PROXY_TOKEN` and `startCredentialServiceFn`.

## Capabilities

### Modified Capabilities
- `run-agent`: Starts `HostProxy` instead of `CredentialService` + `CredentialWSClient`.
- `acp-session`: Compose file uses `RELAY_TOKEN` env var.
- `docker-generator`: Session compose uses `RELAY_TOKEN` env var.

## Impact

- **Breaking**: Docker Compose files now use `RELAY_TOKEN` instead of `CREDENTIAL_PROXY_TOKEN`. The proxy's `proxy.ts` already handles both via fallback, so existing containers will still work during transition.
- **No new dependencies**: `HostProxy` is already exported from `@clawmasons/proxy`.
- **Test scope**: CLI tests need updating for renamed deps/env vars.

## Dependencies

- Change 8 (Host Proxy Orchestrator) must be implemented — `HostProxy` class must exist.

## Risks

- **Session override support**: `HostProxy` uses `CredentialService` internally which supports `setSessionOverrides()`, but `HostProxy` does not expose this method. For env credentials collected from `process.env`, the `CredentialResolver` will find them via its env resolution strategy. This is functionally equivalent.
- **Backward compatibility**: The `proxy.ts` fallback (`process.env.RELAY_TOKEN || process.env.CREDENTIAL_PROXY_TOKEN`) ensures containers built with the old token name still work.
