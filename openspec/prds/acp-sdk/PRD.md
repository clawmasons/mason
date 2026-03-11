# ACP SDK Migration — Product Requirements Document

**Version:** 0.1.0 · Draft
**Date:** March 2026
**Author:** Clawmasons, Inc.
**Depends on:** acp-bridge spec, acp-session spec, mcp-agent-package spec

---

## 1. Problem Statement

Chapter's current ACP implementation uses a bespoke two-layer HTTP relay architecture to bridge communication between ACP clients (editors) and the agent container. This architecture has several deficiencies:

- **Custom wire protocol:** The container agent (`acp-server.ts`) speaks a non-standard `{ command: string }` / `{ output, exit }` HTTP protocol, not the ACP JSON-RPC protocol. Messages from the ACP client are opaquely forwarded as HTTP bodies to the agent, which does not understand ACP semantics.

- **Double HTTP hop:** The `StdioBridge` translates stdin/stdout ndjson into HTTP POST requests to an internal `AcpBridge` HTTP server, which then makes another HTTP request to the container agent. This creates unnecessary complexity: two HTTP servers, hop-by-hop header stripping, content-length management, and timeout chaining across three components.

- **Port exposure and networking fragility:** The agent container exposes port 3002 via `--service-ports` in `docker compose run`. This requires port mapping in the compose file, creates port collision risks when running multiple agents, and forces the host to route traffic through Docker's port forwarding layer.

- **Stub response fragility:** The bridge's deferred startup returns hand-crafted JSON-RPC stub responses for `initialize` before the agent is running. These stubs hardcode a protocol version and empty capabilities. As the ACP protocol evolves, maintaining these stubs becomes a source of protocol drift.

- **No protocol-level connection semantics:** The HTTP relay has no concept of connection lifecycle. Idle detection uses a timer-based heuristic (no requests for N seconds = client disconnected). The SDK provides `connection.signal` and `connection.closed` for proper lifecycle management.

The `@agentclientprotocol/sdk` provides `AgentSideConnection`, `ClientSideConnection`, and `ndJsonStream` — a transport-agnostic, stream-based implementation of the ACP protocol. Adopting it eliminates the custom wire protocol, removes the HTTP relay layer, and aligns the system with the canonical ACP implementation.

---

## 2. Goals

### Technical Goals

- **Protocol compliance:** All ACP message handling SHALL use `@agentclientprotocol/sdk` types and connection classes, ensuring wire-format correctness and forward compatibility.
- **Transport simplification:** Replace the two-HTTP-hop architecture with direct stream piping. The bridge-to-container link SHALL use `docker exec -i` with piped stdio instead of HTTP.
- **Remove HTTP surface area:** Eliminate the internal HTTP bridge server, the container HTTP server (`acp-server.ts`), port exposure in compose, the `--service-ports` flag, and the `--transport` CLI option entirely.
- **Preserve deferred startup:** The bridge SHALL continue to defer agent container startup until `session/new` arrives with a `cwd` field.

### User Goals

- No change to the editor-facing CLI interface (`clawmasons acp --role <name>`). Editors still spawn the process and communicate via stdio ndjson.
- No change to credential resolution flow.

---

## 3. Non-Goals

- **Full ACP agent implementation:** Implementing a complete ACP-compliant agent with LLM-driven prompt handling, tool permission flow, etc. is future work. The initial migration preserves the current tool-calling behavior, adapted to use ACP message types.
- **Removing Docker Compose:** The session orchestration via Docker Compose (`AcpSession`) is unchanged.
- **Implementing new ACP capabilities:** Features like `loadSession`, `forkSession`, terminal support, and file system access are not in scope.
- **HTTP transport mode:** The `--transport http` option is removed, not preserved. Editors SHALL use stdio exclusively.

---

## 4. Core Concepts

### 4.1 Bridge as Protocol Mediator

The bridge acts as a dual-role ACP participant:

```
Editor (Client)  ──stdio/ndjson──>  Bridge  ──docker exec stdio/ndjson──>  Container Agent
                                  (AgentSideConnection         (AgentSideConnection
                                   facing the editor,           facing the bridge)
                                   ClientSideConnection
                                   facing the container)
```

The bridge presents an `AgentSideConnection` to the editor and a `ClientSideConnection` to the container agent. It mediates all ACP messages between the two, performing:

- **Deferred startup:** Handles `initialize` locally, starts the container on `session/new`, then forwards.
- **Message forwarding:** Once connected, proxies all requests, responses, and notifications bidirectionally.

### 4.2 Container Agent as ACP Endpoint

The container agent uses `AgentSideConnection` to accept ACP messages over stdio (stdin/stdout ndjson). It replaces the current HTTP server (`acp-server.ts`) entirely. The agent implements the `Agent` interface from the SDK with `initialize`, `newSession`, and `prompt` handlers that delegate to the existing `ToolCaller`.

### 4.3 Stream Transport via Docker Compose Run (Piped Stdio)

Instead of exposing a port and making HTTP requests, the bridge connects to the container agent by spawning `docker compose run` (without `-d`) as a child process with piped stdin/stdout. This creates a bidirectional byte stream that is wrapped with `ndJsonStream()` to produce a `Stream` for `ClientSideConnection`.

The container agent's entrypoint writes ndjson to stdout and reads from stdin. Build output from `--build` goes to stderr and does not corrupt the ndjson stream.

**Why not `docker exec -i`?** The original design proposed `docker compose run -d` followed by `docker exec -i <container-id> <entrypoint>`. This approach has several problems:

1. **Keep-alive command required:** With `-d`, the compose `command` runs immediately. If the command is the agent, it starts with no stdin connected. If the command is a keep-alive (`sleep infinity`), the agent must be started separately via `docker exec`, which means the compose `command` and the actual agent entrypoint diverge.
2. **Container ID capture complexity:** `docker compose run -d` prints the container ID to stdout, but `execComposeCommand` currently returns only an exit code. Capturing stdout requires interface changes and a fallback discovery path (`docker compose ps --format json`).
3. **Two processes in container:** `docker exec` starts a new process alongside whatever the compose `command` started, creating confusion about which process is the agent.

The simpler approach — `docker compose run` (no `-d`) with piped stdio — eliminates all three problems. The compose `command` IS the agent entrypoint, the child process handle IS the transport, and no container ID discovery is needed.

**Node.js-to-Web Streams Conversion:** The SDK's `ndJsonStream()` expects Web Streams API types (`WritableStream<Uint8Array>`, `ReadableStream<Uint8Array>`), not Node.js streams. Implementations MUST convert using `Readable.toWeb(child.stdout)` and `Writable.toWeb(child.stdin)` (or the equivalent `process.stdin`/`process.stdout` conversions for the editor-facing side).

### 4.4 Deferred Startup with SDK

The deferred startup pattern changes from HTTP stub responses to SDK-level handling:

1. Editor sends `initialize` over stdio. The bridge's `AgentSideConnection` handles this directly, returning capabilities from local config (no container needed).
2. Editor sends `session/new` with `cwd`. The bridge intercepts this in its `Agent.newSession` handler, starts the container via `AcpSession.startAgent(cwd)`, establishes the `docker exec` stream to the container, creates a `ClientSideConnection`, forwards `initialize` + `session/new` to the container agent, and returns the response.
3. Subsequent messages (`prompt`, `cancel`, notifications) are forwarded bidirectionally.

---

## 5. Requirements

### P0 — Must Have

**REQ-SDK-001: Container Agent uses AgentSideConnection**

The container agent (`packages/mcp-agent/src/`) SHALL use `AgentSideConnection` from `@agentclientprotocol/sdk` as its ACP endpoint. The agent SHALL implement the `Agent` interface with handlers for `initialize`, `newSession`, and `prompt`. The custom HTTP server (`acp-server.ts`) SHALL be removed.

Acceptance criteria:

- GIVEN the container agent starts with `--acp`
- WHEN it reads ndjson from stdin
- THEN it SHALL process ACP protocol messages via `AgentSideConnection`
- AND it SHALL write ACP responses as ndjson to stdout

---

**REQ-SDK-002: Bridge uses AgentSideConnection for editor-facing transport**

The bridge SHALL use `AgentSideConnection` to handle the editor-facing stdio connection. The `StdioBridge` and `AcpBridge` HTTP server SHALL be replaced by a single `AgentSideConnection` backed by `ndJsonStream(process.stdout, process.stdin)`.

Acceptance criteria:

- GIVEN the CLI starts with `clawmasons acp --role <name>`
- WHEN the editor writes ndjson to the process's stdin
- THEN the bridge SHALL process it via `AgentSideConnection`
- AND responses SHALL be written as ndjson to stdout

---

**REQ-SDK-003: Bridge uses ClientSideConnection for container-facing transport**

The bridge SHALL use `ClientSideConnection` to communicate with the container agent. The transport SHALL be a `docker exec -i <container-id>` child process with piped stdin/stdout, wrapped in `ndJsonStream()`.

Acceptance criteria:

- GIVEN the bridge has started the agent container
- WHEN the bridge needs to send an ACP message to the container
- THEN it SHALL use `ClientSideConnection` over a `docker exec -i` stdio stream
- AND the container agent SHALL receive and process the message via its `AgentSideConnection`

---

**REQ-SDK-004: Deferred startup preserved**

The bridge SHALL defer agent container startup until `session/new` arrives. The bridge's `Agent.initialize` handler SHALL respond locally with server info and capabilities. The bridge's `Agent.newSession` handler SHALL trigger container startup, establish the `docker exec` stream, and forward `initialize` + `session/new` to the container.

Acceptance criteria:

- GIVEN the bridge is running with no agent container
- WHEN the editor sends `initialize`
- THEN the bridge SHALL respond with a valid `InitializeResponse` without starting a container

- AND WHEN the editor sends `session/new` with `cwd`
- THEN the bridge SHALL start the agent container with `cwd` mounted
- AND establish a `ClientSideConnection` to the container via `docker exec -i`
- AND forward `initialize` and `session/new` to the container

---

**REQ-SDK-005: Remove HTTP port exposure from compose**

The generated `docker-compose.yml` SHALL NOT expose the agent's ACP port to the host. The `ports` section for the ACP port and `--service-ports` flag SHALL be removed from the agent service definition. Communication SHALL occur via `docker exec -i` stdio.

Acceptance criteria:

- GIVEN a generated `docker-compose.yml` for an ACP session
- WHEN the agent service definition is inspected
- THEN it SHALL NOT contain a `ports` mapping for the ACP port
- AND `docker compose run` SHALL NOT use the `--service-ports` flag

---

**REQ-SDK-006: Remove HTTP transport mode**

The `--transport` CLI option SHALL be removed from the `clawmasons acp` command. The bridge SHALL use stdio exclusively. The internal HTTP bridge server SHALL be removed.

Acceptance criteria:

- GIVEN the CLI command `clawmasons acp`
- WHEN `--transport http` is passed
- THEN the CLI SHALL reject it with an error (unknown option)

---

**REQ-SDK-007: E2E tests use ClientSideConnection**

The E2E test (`e2e/tests/acp-client-spawn.test.ts`) SHALL use `ClientSideConnection` from the SDK to communicate with the bridge, replacing the current raw ndjson/fetch-based approach.

Acceptance criteria:

- GIVEN the E2E test spawns the `clawmasons acp` process
- WHEN the test sends `initialize` and `session/new`
- THEN it SHALL use `ClientSideConnection` with `ndJsonStream` over the spawned process's stdio
- AND the test SHALL verify the full ACP handshake and session lifecycle

---

**REQ-SDK-008: Agent flag simplification**

The container agent's `--acp` flag SHALL default to stdio mode. The `--port` flag SHALL be removed for ACP mode. The agent reads from stdin and writes to stdout when `--acp` is specified.

Acceptance criteria:

- GIVEN the container agent is started with `--acp`
- WHEN no `--port` is specified
- THEN the agent SHALL use stdin/stdout for ACP communication
- AND the `--port` option SHALL not be accepted alongside `--acp`

---

### P1 — Should Have

**REQ-SDK-009: Connection lifecycle management**

The bridge SHALL use `connection.signal` and `connection.closed` from the SDK to detect editor disconnection, replacing the idle timer heuristic. When the editor-facing connection closes, the bridge SHALL stop the agent container and reset for a new session.

Acceptance criteria:

- GIVEN the bridge is connected to an editor and an agent
- WHEN the editor closes its stdio stream (process exits)
- THEN the bridge SHALL detect closure via `connection.signal` or `connection.closed`
- AND stop the agent container
- AND be ready to accept a new connection

---

**REQ-SDK-010: Bidirectional notification forwarding**

The bridge SHALL forward all notifications bidirectionally between the editor and container. Agent-to-client notifications (e.g., `session/update`) SHALL be forwarded from the container's `AgentSideConnection` to the editor. Client-to-agent notifications SHALL be forwarded from the editor to the container.

Acceptance criteria:

- GIVEN the bridge is connected to both editor and container
- WHEN the container agent sends a `session/update` notification
- THEN the bridge SHALL forward it to the editor
- AND WHEN the editor sends a cancel notification
- THEN the bridge SHALL forward it to the container

---

**REQ-SDK-011: Container ID capture from docker compose run**

When using `docker compose run -d`, the session module SHALL capture the container ID from the command's stdout output. This container ID is required for the subsequent `docker exec -i` command. If capture fails, the session SHALL fall back to `docker compose ps --format json` to discover the container.

Acceptance criteria:

- GIVEN `docker compose run -d` is executed
- WHEN the command succeeds
- THEN the session module SHALL capture the container ID from stdout
- AND provide it to the bridge for `docker exec -i` usage

---

## 6. Architecture

### 6.1 Current Architecture (to be replaced)

```
Editor ──stdin/stdout──> StdioBridge ──HTTP──> AcpBridge (internal HTTP server)
                                                  │
                                                  └──HTTP──> Container Agent (HTTP server, port 3002)
```

Components: `StdioBridge`, `AcpBridge`, `acp-server.ts` (container HTTP server)

### 6.2 Target Architecture

```
Editor ──stdin/stdout (ndjson)──> Bridge AgentSideConnection
                                       │
                                       │  (in-process mediation)
                                       │
                                  Bridge ClientSideConnection
                                       │
                                       └──docker exec -i (ndjson)──> Container AgentSideConnection
```

Components:

- **Bridge module** (`packages/cli/src/acp/bridge.ts` — rewritten): Owns one `AgentSideConnection` (editor-facing) and one `ClientSideConnection` (container-facing). Implements `Agent` interface for the editor side, forwarding to the container via `ClientSideConnection`.
- **Container agent** (`packages/mcp-agent/src/index.ts` — modified): In ACP mode, creates `AgentSideConnection` with `ndJsonStream(process.stdout, process.stdin)` and implements the `Agent` interface.
- **Orchestrator** (`packages/cli/src/cli/commands/run-acp-agent.ts` — modified): Creates the bridge, wires lifecycle, starts Docker. No longer creates `StdioBridge` or internal HTTP server.

### 6.3 Docker Exec Stream

When the bridge needs to connect to a running container agent:

1. `AcpSession.startAgent(cwd)` returns the container ID (captured from `docker compose run -d` output).
2. The bridge spawns: `docker exec -i <container-id> <agent-entrypoint> --acp`
3. The child process's stdin/stdout are wrapped: `ndJsonStream(child.stdin, child.stdout)`.
4. A `ClientSideConnection` is created with this stream.
5. The bridge sends `initialize` followed by the buffered `session/new` to the container.

### 6.4 File Impact Summary

| File | Action | Rationale |
|------|--------|-----------|
| `packages/cli/src/acp/bridge.ts` | Rewrite | Replace HTTP relay with `AgentSideConnection` + `ClientSideConnection` |
| `packages/cli/src/acp/stdio-bridge.ts` | Remove | Replaced by SDK's `ndJsonStream` on process stdio |
| `packages/cli/src/acp/session.ts` | Modify | Remove port exposure from compose, capture container ID, remove `--service-ports` |
| `packages/cli/src/acp/logger.ts` | Keep | No changes |
| `packages/cli/src/acp/matcher.ts` | Keep | No changes |
| `packages/cli/src/acp/rewriter.ts` | Keep | No changes |
| `packages/cli/src/acp/warnings.ts` | Keep | No changes |
| `packages/cli/src/cli/commands/run-acp-agent.ts` | Modify | Wire new bridge, remove `StdioBridge` creation, remove internal HTTP port logic, remove `--transport` option |
| `packages/mcp-agent/src/acp-server.ts` | Remove | Replaced by `AgentSideConnection` in `index.ts` |
| `packages/mcp-agent/src/index.ts` | Modify | ACP mode uses `AgentSideConnection` with stdin/stdout instead of HTTP server |
| `e2e/tests/acp-client-spawn.test.ts` | Modify | Use `ClientSideConnection` instead of raw ndjson/fetch |

### 6.5 New Dependency

| Package | Version | Installed In |
|---------|---------|-------------|
| `@agentclientprotocol/sdk` | `^0.16.0` | `packages/cli`, `packages/mcp-agent`, `e2e` |

---

## 7. Open Questions

**OQ-1: Docker exec entrypoint command**

When using `docker exec -i <container-id> <command>`, the bridge needs to know the agent's entrypoint command. This is currently defined in the compose file's `command` field. Should the session module extract this from the compose config, or should the bridge use a well-known entrypoint path (e.g., `/usr/local/bin/agent --acp`)?

**OQ-2: Container ID capture reliability**

`docker compose run -d` prints the container ID to stdout. The current `execComposeCommand` helper may not capture this output. The session module may need modification to either: (a) return the container ID from `startAgent()`, or (b) use `docker compose ps --format json` to look up the container after start.

**OQ-3: Credential flow timing with docker exec**

Currently, the container agent starts its HTTP server immediately and resolves credentials in the background. With stdio-based ACP, the agent must be ready to receive `initialize` as soon as the `docker exec` stream connects. Does credential resolution need to complete before the agent signals readiness, or can it remain deferred? The SDK's `Agent.newSession` handler is a natural place to block on credential readiness.

**OQ-4: Multiple sequential sessions**

The current bridge supports stop-and-restart of the agent container when the editor disconnects and reconnects. With the SDK's connection lifecycle (`connection.closed`), the bridge needs to support tearing down the `ClientSideConnection`, stopping the container, and creating a new `ClientSideConnection` when a new `session/new` arrives. Does this require recreating the editor-facing `AgentSideConnection` as well, or can it persist across sessions?
