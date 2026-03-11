## Why

The E2E test (`e2e/tests/acp-client-spawn.test.ts`) currently uses raw HTTP fetch requests and health endpoint polling to interact with the ACP bridge. This tests a code path that no longer exists -- the HTTP transport was removed in CHANGE 4 (orchestrator update). The tests spawn the process with `--transport http` and `--port`, which are now invalid CLI flags.

Additionally, real ACP clients (editors) communicate via `ClientSideConnection` over stdio ndjson, not HTTP. The E2E tests should exercise the same protocol path to give confidence in protocol compliance.

The `@agentclientprotocol/sdk` provides `ClientSideConnection` and `ndJsonStream` which can be used to wrap the spawned process's stdin/stdout, providing a type-safe, protocol-compliant test client.

## What Changes

- Rewrite `e2e/tests/acp-client-spawn.test.ts` to use `ClientSideConnection` from the SDK
- Spawn `clawmasons acp --role chapter-creator` without `--transport http` or `--port`
- Create `ClientSideConnection` with `ndJsonStream()` over the spawned process's stdin/stdout
- Send `initialize`, `session/new`, and `prompt` via SDK client methods
- Use `connection.closed` for lifecycle management
- Remove HTTP health polling, fetch-based requests, and port constants
- Add `@agentclientprotocol/sdk` dependency to `e2e/package.json`

## Capabilities

### Modified Capabilities
- `e2e-chapter-workflow`: E2E tests updated to use SDK `ClientSideConnection` instead of raw HTTP fetch, exercising the same protocol path as real editors

### Removed Capabilities
- HTTP-based E2E test client (raw fetch, health polling, port constants)

## Impact

- **Modified file:** `e2e/tests/acp-client-spawn.test.ts` -- complete rewrite from HTTP to SDK client
- **Modified file:** `e2e/package.json` -- add `@agentclientprotocol/sdk` dependency
- **PRD refs:** REQ-SDK-007
