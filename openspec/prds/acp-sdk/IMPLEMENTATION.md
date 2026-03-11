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
Editor ──stdio/ndjson──> Bridge AgentSideConnection ──docker exec stdio/ndjson──> Container AgentSideConnection
```

### Key Files Reference
| Current File | Action |
|---|---|
| `packages/mcp-agent/src/acp-server.ts` | **Remove** — HTTP server replaced by AgentSideConnection |
| `packages/mcp-agent/src/index.ts` | **Modify** — ACP mode uses AgentSideConnection on stdin/stdout |
| `packages/cli/src/acp/stdio-bridge.ts` | **Remove** — replaced by SDK's ndJsonStream |
| `packages/cli/src/acp/bridge.ts` | **Rewrite** — AgentSideConnection + ClientSideConnection |
| `packages/cli/src/acp/session.ts` | **Modify** — remove port exposure, capture container ID |
| `packages/cli/src/cli/commands/run-acp-agent.ts` | **Modify** — wire new bridge, remove transport option |
| `e2e/tests/acp-client-spawn.test.ts` | **Modify** — use ClientSideConnection |

---

# Implementation Steps

## CHANGE 1: Container Agent — Replace HTTP server with AgentSideConnection

Replace `acp-server.ts` (HTTP server on port 3002) with an `AgentSideConnection` that reads/writes ACP ndjson on stdin/stdout. The container agent becomes a proper ACP endpoint.

**Scope:**
- Create new `packages/mcp-agent/src/acp-agent.ts` implementing the SDK `Agent` interface (`initialize`, `newSession`, `prompt`) backed by the existing `ToolCaller`
- Modify `packages/mcp-agent/src/index.ts`: when `--acp` is passed, create `AgentSideConnection` with `ndJsonStream(process.stdout, process.stdin)` instead of calling `startAcpServer()`
- Remove `--port` flag acceptance when `--acp` is specified (REQ-SDK-008)
- Remove `packages/mcp-agent/src/acp-server.ts`
- Add `@agentclientprotocol/sdk` dependency to `packages/mcp-agent/package.json`

**User Story:** As a developer, I can run `node mcp-agent.js --acp` and communicate with the agent via ACP ndjson on stdin/stdout, verified by piping manual JSON-RPC messages.

**Testing:** Unit test that spawns the agent process with `--acp`, sends `initialize` + `session/new` + `prompt` (tool list) via stdin ndjson, and verifies correct ACP responses on stdout.

**PRD refs:** REQ-SDK-001, REQ-SDK-008

**Not Implemented Yet**

---

## CHANGE 2: Session Module — Remove port exposure, capture container ID

Modify `AcpSession` to stop exposing port 3002 in docker-compose and to capture the container ID from `docker compose run -d` output. The container ID is needed for `docker exec -i` in the next change.

**Scope:**
- `packages/cli/src/acp/session.ts`: Remove `ports: "${acpPort}:${acpPort}"` from `generateAcpComposeYml()`
- Remove `--service-ports` from `startAgent()` run args
- Modify `startAgent()` to capture container ID from `docker compose run -d` stdout output
- Add fallback: if capture fails, use `docker compose ps --format json` to discover the container
- Return `containerId` in `AgentSessionInfo`
- Remove `acpPort` from `AgentSessionInfo` (no longer relevant)
- Update `AcpSessionConfig` to remove `acpPort` (no port needed)

**User Story:** As the bridge, I receive the container ID from `startAgent()` so I can establish a `docker exec -i` stream to it instead of making HTTP requests to an exposed port.

**Testing:** Unit test that verifies `generateAcpComposeYml()` output contains no `ports:` for the agent service. Integration test that `startAgent()` returns a valid `containerId`.

**PRD refs:** REQ-SDK-005, REQ-SDK-011

**Not Implemented Yet**

---

## CHANGE 3: Bridge Rewrite — AgentSideConnection + ClientSideConnection with docker exec

Rewrite `bridge.ts` to use the SDK's dual-connection architecture. Remove `stdio-bridge.ts` entirely. The bridge presents `AgentSideConnection` to the editor (via process stdin/stdout) and `ClientSideConnection` to the container (via `docker exec -i` stdin/stdout).

**Scope:**
- Rewrite `packages/cli/src/acp/bridge.ts`:
  - Create `AgentSideConnection` with `ndJsonStream(process.stdout, process.stdin)` for editor-facing transport
  - Implement `Agent` interface: `initialize` returns capabilities locally; `newSession` triggers container start (via callback), spawns `docker exec -i <containerId> <entrypoint> --acp`, creates `ClientSideConnection` with `ndJsonStream(child.stdin, child.stdout)`, forwards `initialize` + `session/new` to container
  - `prompt` and other methods forward bidirectionally via `ClientSideConnection`
  - Use `connection.signal` / `connection.closed` for lifecycle detection (REQ-SDK-009)
  - Forward all notifications bidirectionally (REQ-SDK-010)
- Remove `packages/cli/src/acp/stdio-bridge.ts`
- Remove `AcpBridgeConfig` (no HTTP ports), export new `AcpSdkBridge` class or function
- The bridge needs: `containerId`, `agentEntrypoint` (command to run inside container), `onSessionNew` callback

**User Story:** As an editor, I spawn `clawmasons acp --role <name>` and communicate via ndjson on stdin/stdout using the standard ACP protocol. The bridge handles deferred startup transparently — `initialize` responds immediately, `session/new` starts the container, and subsequent `prompt` messages are forwarded to the container.

**Testing:** Unit test using mock streams: verify `initialize` returns capabilities without starting container, `session/new` triggers `onSessionNew` callback and creates `ClientSideConnection`, `prompt` is forwarded and response returned.

**PRD refs:** REQ-SDK-002, REQ-SDK-003, REQ-SDK-004, REQ-SDK-009, REQ-SDK-010

**Not Implemented Yet**

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
  - Wire the new bridge: pass `onSessionNew` callback that calls `session.startAgent(cwd)` and returns the `containerId`
  - Remove `containerHost` / `containerPort` / `connectRetries` configuration
  - Simplify shutdown handler (no HTTP server to close)
- Update `RunAcpAgentOptions`: remove `port`, `transport` fields
- Update `RunAcpAgentDeps`: remove `createBridgeFn` (or update signature)
- Remove `RUN_ACP_AGENT_HELP_EPILOG` references to `--transport http`

**User Story:** As an editor plugin author, I configure `clawmasons acp --role <name>` as a stdio command. The `--transport` flag is gone; stdio is the only mode. If I accidentally pass `--transport http`, I get "unknown option".

**Testing:** Verify `clawmasons acp --transport http` fails with unknown option error. Verify the orchestrator creates the SDK bridge and wires lifecycle correctly.

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
  - `StdioBridge` class
  - `AcpBridge` class (old HTTP version)
  - `acp-server.ts` imports
  - `containerPort`, `containerHost`, `--service-ports` in session
  - `--transport` option in help text, config types, or tests
- Update `packages/cli/src/materializer/common.ts`: remove `--port` from `ACP_RUNTIME_COMMANDS` if present
- Update any unit tests in `packages/cli/tests/` and `packages/mcp-agent/tests/` that reference removed APIs
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

## Open Questions (from PRD, with recommendations)

| ID | Question | Recommendation |
|---|---|---|
| OQ-1 | Docker exec entrypoint command | Use a well-known path: the compose file's `command` field already defines the entrypoint. Extract it from compose config or hardcode the agent-entry path. |
| OQ-2 | Container ID capture reliability | Primary: parse stdout from `docker compose run -d`. Fallback: `docker compose ps --format json` with service name filter. Implement both in CHANGE 2. |
| OQ-3 | Credential flow timing | Block on credential resolution in `Agent.newSession` handler — natural fit. The bridge's local `initialize` response doesn't need credentials. |
| OQ-4 | Multiple sequential sessions | Recreate both `ClientSideConnection` (tear down docker exec process) and keep `AgentSideConnection` alive. The editor-facing connection persists; only the container-facing connection cycles. |
