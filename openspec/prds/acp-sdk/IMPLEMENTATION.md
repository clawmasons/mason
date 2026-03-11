# ACP SDK Migration — Implementation Plan

**PRD:** [PRD.md](./PRD.md)
**Status:** Planning
**Date:** March 2026

---

## Overview

This plan migrates Chapter's ACP architecture from a bespoke two-layer HTTP relay to the canonical `@agentclientprotocol/sdk`. The changes are ordered so each produces a concrete, testable output before the next begins.

### Current Architecture (what we're replacing)
```
Editor ──stdio──> StdioBridge ──HTTP──> AcpBridge ──HTTP──> Container (acp-server.ts :3002)
```

### Target Architecture
```
Editor ──stdio/ndjson──> Bridge AgentSideConnection ──docker compose run (piped stdio/ndjson)──> Container AgentSideConnection
```

### Key Files Reference
| Current File | Action |
|---|---|
| `packages/mcp-agent/src/acp-server.ts` | **Remove** — HTTP server replaced by AgentSideConnection |
| `packages/mcp-agent/src/index.ts` | **Modify** — ACP mode uses AgentSideConnection on stdin/stdout |
| `packages/cli/src/acp/stdio-bridge.ts` | **Remove** — replaced by SDK's ndJsonStream |
| `packages/cli/src/acp/bridge.ts` | **Rewrite** — AgentSideConnection + ClientSideConnection |
| `packages/cli/src/acp/session.ts` | **Modify** — remove port exposure, add `startAgentProcess()`, remove `--service-ports` |
| `packages/cli/src/cli/commands/run-acp-agent.ts` | **Modify** — wire new bridge, remove transport option |
| `e2e/tests/acp-client-spawn.test.ts` | **Modify** — use ClientSideConnection |
| `packages/cli/tests/acp/bridge.test.ts` | **Rewrite** — tests HTTP relay; must test SDK bridge |
| `packages/cli/tests/acp/session.test.ts` | **Modify** — update for port removal, `startAgentProcess()` |
| `packages/cli/tests/cli/run-acp-agent.test.ts` | **Modify** — remove transport/port refs, update bridge wiring |

---

# Implementation Steps

## CHANGE 1: Container Agent — Replace HTTP server with AgentSideConnection

Replace `acp-server.ts` (HTTP server on port 3002) with an `AgentSideConnection` that reads/writes ACP ndjson on stdin/stdout. The container agent becomes a proper ACP endpoint.

**Scope:**
- Create new `packages/mcp-agent/src/acp-agent.ts` implementing the SDK `Agent` interface (`initialize`, `newSession`, `prompt`) backed by the existing `ToolCaller`
- Modify `packages/mcp-agent/src/index.ts`: when `--acp` is passed, create `AgentSideConnection` with `ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin))` instead of calling `startAcpServer()`
- **Stdout protection (REQ-SDK-012):** Redirect all `console.log` to `console.error` (stderr) when `--acp` is specified, BEFORE creating the `AgentSideConnection`. Currently `index.ts` uses `console.log` in 5+ places and `console.error` in others — all must go to stderr in ACP mode.
- **Web Streams conversion:** `ndJsonStream()` expects `WritableStream<Uint8Array>` / `ReadableStream<Uint8Array>` (Web Streams API). Use `import { Readable, Writable } from 'node:stream'` with `.toWeb()` to convert Node.js streams.
- Remove `--port` flag acceptance when `--acp` is specified (REQ-SDK-008)
- Remove `packages/mcp-agent/src/acp-server.ts`
- Add `@agentclientprotocol/sdk` dependency to `packages/mcp-agent/package.json`

**User Story:** As a developer, I can run `node mcp-agent.js --acp` and communicate with the agent via ACP ndjson on stdin/stdout, verified by piping manual JSON-RPC messages.

**Testing:** Unit test that spawns the agent process with `--acp`, sends `initialize` + `session/new` + `prompt` (tool list) via stdin ndjson, and verifies correct ACP responses on stdout. Verify no non-protocol output appears on stdout (stdout protection).

**PRD refs:** REQ-SDK-001, REQ-SDK-008, REQ-SDK-012

**Implemented** — [proposal](../../changes/archive/2026-03-10-container-agent-sdk/proposal.md) · [design](../../changes/archive/2026-03-10-container-agent-sdk/design.md) · [tasks](../../changes/archive/2026-03-10-container-agent-sdk/tasks.md)

---

## CHANGE 2: Session Module — Remove port exposure, add `startAgentProcess()`

Modify `AcpSession` to stop exposing port 3002 in docker-compose and add a new `startAgentProcess()` method that spawns `docker compose run` (no `-d`) with piped stdio. This replaces the detached container + HTTP approach with a direct stdio transport.

**Scope:**
- `packages/cli/src/acp/session.ts`:
  - Remove `ports: "${acpPort}:${acpPort}"` from `generateAcpComposeYml()`
  - Remove `--service-ports` from `startAgent()` run args
  - Remove `acpPort` from `AgentSessionInfo` (no longer relevant)
  - Remove `acpPort` from `AcpSessionConfig` (no port needed)
  - Remove `acpPort` from `generateAcpComposeYml()` opts and generated YAML
  - Add new `startAgentProcess(projectDir)` method that spawns `docker compose run --rm --build -v ${cwd}:/workspace <service>` as a child process with `stdio: ['pipe', 'pipe', 'pipe']` (no `-d` flag). Returns `{ child: ChildProcess, agentInfo: AgentSessionInfo }`.
  - Update `stopAgent()` to also kill the child process if one exists
  - **Note:** `execComposeCommand` returns only exit codes and cannot be used here. `startAgentProcess()` uses `child_process.spawn()` directly with the compose command.
- `packages/cli/tests/acp/session.test.ts`:
  - Update tests that verify port exposure (`"3002:3002"`) — these should now verify NO ports section
  - Add tests for `startAgentProcess()` returning a child process handle
  - Update `startAgent()` tests to verify no `--service-ports` flag

**User Story:** As the bridge, I call `startAgentProcess(cwd)` and receive a child process whose stdin/stdout I can wrap with `ndJsonStream()` for direct ACP communication — no port mapping, no container ID discovery.

**Testing:** Unit test that verifies `generateAcpComposeYml()` output contains no `ports:` for the agent service. Unit test that `startAgentProcess()` spawns compose without `-d` and returns a child process. Verify `stopAgent()` kills the child process.

**PRD refs:** REQ-SDK-005, REQ-SDK-011

**Implemented** — [proposal](../../changes/archive/2026-03-11-session-module-sdk/proposal.md) · [design](../../changes/archive/2026-03-11-session-module-sdk/design.md) · [tasks](../../changes/archive/2026-03-11-session-module-sdk/tasks.md)

---

## CHANGE 3: Bridge Rewrite — AgentSideConnection + ClientSideConnection with piped stdio

Rewrite `bridge.ts` to use the SDK's dual-connection architecture. Remove `stdio-bridge.ts` entirely. The bridge presents `AgentSideConnection` to the editor (via process stdin/stdout) and `ClientSideConnection` to the container (via `docker compose run` piped stdio).

**Scope:**
- Rewrite `packages/cli/src/acp/bridge.ts`:
  - Create `AgentSideConnection` with `ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin))` for editor-facing transport
  - Implement `Agent` interface: `initialize` returns capabilities locally; `newSession` triggers container start (via `onSessionNew` callback which returns a `ChildProcess`), creates `ClientSideConnection` with `ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout))`, forwards `initialize` + `session/new` to container
  - `prompt` and other methods forward bidirectionally via `ClientSideConnection`
  - Use `connection.signal` / `connection.closed` for lifecycle detection (REQ-SDK-009)
  - Forward all notifications bidirectionally (REQ-SDK-010)
  - Handle container process crash: listen for child process `exit`/`error` events and `ClientSideConnection.closed`, clean up and reset for next session (REQ-SDK-013)
- Remove `packages/cli/src/acp/stdio-bridge.ts`
- Remove `AcpBridgeConfig` (no HTTP ports), export new `AcpSdkBridge` class or function
- The bridge needs: `onSessionNew` callback (returns `ChildProcess`)
- Rewrite `packages/cli/tests/acp/bridge.test.ts`:
  - Replace all HTTP-based tests with SDK stream-based tests
  - Test `initialize` returns capabilities without starting container
  - Test `session/new` triggers callback and creates `ClientSideConnection`
  - Test `prompt` forwarding and response
  - Test container crash detection and recovery
  - Test notification forwarding (bidirectional)
  - Test connection lifecycle (`connection.closed`)
  - Remove `parseRequestBody`, `extractCwdFromBody` tests (functions removed)

**User Story:** As an editor, I spawn `clawmasons acp --role <name>` and communicate via ndjson on stdin/stdout using the standard ACP protocol. The bridge handles deferred startup transparently — `initialize` responds immediately, `session/new` starts the container, and subsequent `prompt` messages are forwarded to the container.

**Testing:** Unit test using mock streams: verify `initialize` returns capabilities without starting container, `session/new` triggers `onSessionNew` callback and creates `ClientSideConnection`, `prompt` is forwarded and response returned. Verify container crash triggers cleanup. Verify notifications forwarded bidirectionally.

**PRD refs:** REQ-SDK-002, REQ-SDK-003, REQ-SDK-004, REQ-SDK-009, REQ-SDK-010, REQ-SDK-013

**Implemented** — [proposal](../../changes/archive/2026-03-11-bridge-rewrite-sdk/proposal.md) · [design](../../changes/archive/2026-03-11-bridge-rewrite-sdk/design.md) · [tasks](../../changes/archive/2026-03-11-bridge-rewrite-sdk/tasks.md)

---

## CHANGE 4: Orchestrator Update — Wire new bridge, remove transport option

Update `run-acp-agent.ts` to use the new SDK bridge and remove the `--transport` CLI option. Stdio is the only transport.

**Scope:**
- `packages/cli/src/cli/commands/run-acp-agent.ts`:
  - Remove `--transport` option from commander registration
  - Remove `--port` option (no HTTP bridge)
  - Remove `StdioBridge` import and usage
  - Remove `AcpBridge` import; use new SDK bridge from `bridge.ts`
  - Remove `acpAgentPort` constant and all port-related logic
  - Remove `"--port", String(acpAgentPort)` from `acpCommand` construction (line ~584). The compose `command` should be just `["src/index.js", "--acp"]` (no port).
  - Wire the new bridge: pass `onSessionNew` callback that calls `session.startAgentProcess(cwd)` and returns the child process
  - Remove `containerHost` / `containerPort` / `connectRetries` configuration
  - Simplify shutdown handler: kill child process instead of closing HTTP server
  - Remove `bridge.connectToAgent()` call (no HTTP health check needed)
- Update `RunAcpAgentOptions`: remove `port`, `transport` fields
- Update `RunAcpAgentDeps`: remove `createBridgeFn` (or update signature)
- Remove `RUN_ACP_AGENT_HELP_EPILOG` references to `--transport http` and HTTP transport examples
- Update `packages/cli/tests/cli/run-acp-agent.test.ts`:
  - Remove tests referencing `--transport`, `--port`, `StdioBridge`, `AcpBridge`
  - Update bridge wiring tests for SDK bridge
  - Update `acpCommand` assertions to verify no `--port` arg

**User Story:** As an editor plugin author, I configure `clawmasons acp --role <name>` as a stdio command. The `--transport` flag is gone; stdio is the only mode. If I accidentally pass `--transport http`, I get "unknown option".

**Testing:** Verify `clawmasons acp --transport http` fails with unknown option error. Verify the orchestrator creates the SDK bridge and wires lifecycle correctly. Verify `acpCommand` has no `--port`.

**PRD refs:** REQ-SDK-006

**Not Implemented Yet**

---

## CHANGE 5: E2E Tests — Use ClientSideConnection

Rewrite `e2e/tests/acp-client-spawn.test.ts` to use `ClientSideConnection` from the SDK instead of raw HTTP fetch / ndjson.

**Scope:**
- `e2e/tests/acp-client-spawn.test.ts`:
  - Spawn `clawmasons acp --role chapter-creator` (no `--transport http`, no `--port`)
  - Create `ClientSideConnection` with `ndJsonStream(child.stdin, child.stdout)` over the spawned process
  - Send `initialize` via `client.initialize(...)` — verify response has `protocolVersion` and `agentInfo`
  - Send `session/new` via `client.newSession({ cwd, mcpServers: [] })` — triggers container start
  - Send `prompt` via `client.prompt(...)` to exercise tool calling
  - Use `connection.closed` for graceful lifecycle
  - Remove HTTP health polling, fetch-based requests, port constants
- Add `@agentclientprotocol/sdk` dependency to `e2e/package.json`

**User Story:** As a developer running E2E tests, the tests exercise the exact same protocol path that a real editor would use — `ClientSideConnection` over stdio ndjson — giving high confidence in protocol compliance.

**Testing:** The E2E test suite itself is the test. Run `npx vitest run e2e/tests/acp-client-spawn.test.ts` and verify all tests pass.

**PRD refs:** REQ-SDK-007

**Not Implemented Yet**

---

## CHANGE 6: Cleanup — Remove dead code and update materializer

Final cleanup pass to remove all vestiges of the HTTP relay architecture.

**Scope:**
- Verify and remove any remaining references to:
  - `StdioBridge` class (used in `run-acp-agent.ts`, imported from `stdio-bridge.ts`)
  - `AcpBridge` class (old HTTP version, used in `run-acp-agent.ts`, imported from `bridge.ts`)
  - `acp-server.ts` imports (used in `index.ts`)
  - `containerPort`, `containerHost`, `--service-ports` in session
  - `--transport` option in help text, config types, or tests
  - `acpPort` in `AcpSessionConfig`, `AgentSessionInfo`, `SessionInfo`, `generateAcpComposeYml`
  - `extractCwdFromBody` and `parseRequestBody` (bridge helpers, no longer needed)
- `packages/cli/src/materializer/common.ts`: `ACP_RUNTIME_COMMANDS` currently has `"node": "node src/index.js --acp"` (no `--port`) — verify no changes needed. Also verify `generateAcpConfigJson()` port parameter is still appropriate or needs removal.
- Verify all test suites pass:
  - `packages/cli/tests/acp/bridge.test.ts` (rewritten in CHANGE 3)
  - `packages/cli/tests/acp/session.test.ts` (updated in CHANGE 2)
  - `packages/cli/tests/cli/run-acp-agent.test.ts` (updated in CHANGE 4)
  - `packages/mcp-agent/tests/` (any tests referencing `acp-server.ts`)
  - `e2e/tests/acp-client-spawn.test.ts` (rewritten in CHANGE 5)
- Verify `npx tsc --noEmit`, `npx eslint src/ tests/`, `npx vitest run` all pass

**User Story:** As a maintainer, the codebase has no dead HTTP relay code. All imports resolve, all tests pass, and `tsc --noEmit` is clean.

**Testing:** Full CI pass — TypeScript compilation, linting, and all test suites.

**PRD refs:** All — final verification of complete migration

**Not Implemented Yet**

---

## Dependency Graph

```
CHANGE 1 (Container Agent)
    │
    ├──> CHANGE 2 (Session Module) ──> CHANGE 3 (Bridge Rewrite)
    │                                       │
    │                                       ├──> CHANGE 4 (Orchestrator)
    │                                       │        │
    │                                       │        └──> CHANGE 5 (E2E Tests)
    │                                       │                  │
    └───────────────────────────────────────────────────────> CHANGE 6 (Cleanup)
```

**CHANGE 1** and **CHANGE 2** can be developed in parallel since they touch different packages (`mcp-agent` vs `cli/acp/session`). **CHANGE 3** depends on both. **CHANGE 4** depends on **CHANGE 3**. **CHANGE 5** depends on **CHANGE 4**. **CHANGE 6** is the final sweep.

---

## Open Questions (from PRD — all resolved)

| ID | Question | Resolution |
|---|---|---|
| OQ-1 | Docker exec entrypoint command | **Not applicable.** Using `docker compose run` (no `-d`) with piped stdio. The compose `command` IS the entrypoint — no separate discovery needed. |
| OQ-2 | Container ID capture reliability | **Not applicable.** No container ID needed. `docker compose run` (no `-d`) returns a child process handle directly. |
| OQ-3 | Credential flow timing | Block on credential resolution in `Agent.newSession` handler. The bridge's local `initialize` response doesn't need credentials. |
| OQ-4 | Multiple sequential sessions | Kill child process, tear down `ClientSideConnection`, keep editor-facing `AgentSideConnection` alive. On next `session/new`, spawn new `docker compose run` + new `ClientSideConnection`. |
