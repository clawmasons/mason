## 1. Add SDK dependency to e2e

- [x] 1.1 Add `@agentclientprotocol/sdk` to `e2e/package.json` devDependencies
- [x] 1.2 Run `npm install` to update lockfile

## 2. Rewrite E2E test to use ClientSideConnection

- [x] 2.1 Remove HTTP-related imports, constants, and helpers (`ACP_BRIDGE_PORT`, `ACP_PROXY_PORT`, `pollHealthEndpoint`)
- [x] 2.2 Add SDK imports (`ClientSideConnection`, `ndJsonStream`, `Readable`, `Writable`)
- [x] 2.3 Update process spawn: remove `--transport http`, `--port`, `--proxy-port` flags
- [x] 2.4 Create `ClientSideConnection` with `ndJsonStream()` over spawned process stdin/stdout
- [x] 2.5 Rewrite Test 1 (bootstrap): use `initialize()` response as readiness signal instead of HTTP health poll
- [x] 2.6 Rewrite Test 2 (handshake + session): use `client.initialize()` and `client.newSession()` -- verify `protocolVersion`, `agentInfo` in response
- [x] 2.7 Rewrite Test 3 (tool listing): use `client.prompt()` instead of raw HTTP `{ command: "list" }`
- [x] 2.8 Keep Test 4 (credential resolution) unchanged (inspects container logs, orthogonal)
- [x] 2.9 Rewrite Test 5 (graceful shutdown): verify process exits cleanly via exit code, remove HTTP endpoint check

## 3. Verify

- [x] 3.1 TypeScript compilation passes (`npx tsc --noEmit` from e2e directory)
- [x] 3.2 Root-level unit tests still pass (`npx vitest run` excluding e2e) — 1119 tests, 60 files
- [x] 3.3 No remaining references to `ACP_BRIDGE_PORT`, `--transport http`, or `pollHealthEndpoint` in e2e test
