## Context

The E2E test file `e2e/tests/acp-client-spawn.test.ts` exercises the full ACP bootstrap flow: spawning the `clawmasons acp` process, performing the ACP handshake, starting a session with a container, and verifying tool availability.

Previously, the tests used HTTP transport: spawning with `--transport http --port 19800`, polling a health endpoint, and sending raw JSON-RPC via `fetch()`. Changes 1-4 of the ACP SDK migration removed HTTP transport entirely. The bridge now exclusively uses stdio ndjson, and the CLI no longer accepts `--transport` or `--port` flags.

The `@agentclientprotocol/sdk` provides `ClientSideConnection` -- the client-side counterpart to `AgentSideConnection`. It wraps a `Stream` (created via `ndJsonStream()`) and provides typed methods: `initialize()`, `newSession()`, `prompt()`, `cancel()`.

## Goals / Non-Goals

**Goals:**
- Rewrite E2E tests to use `ClientSideConnection` over spawned process stdio
- Exercise the same protocol path that real editors use
- Verify ACP handshake (`initialize` returns `protocolVersion` + `agentInfo`)
- Verify session lifecycle (`session/new` triggers container start)
- Verify tool availability via `prompt`
- Use SDK lifecycle primitives (`connection.closed`)
- Remove all HTTP-related code (fetch, health polling, port constants)

**Non-Goals:**
- Changing the test structure (still sequential tests within a single describe block)
- Adding new test scenarios beyond what existed before
- Testing notification forwarding (covered by unit tests in CHANGE 3)
- Running the tests in CI (Docker required)

## Decisions

### 1. ClientSideConnection wraps spawned process stdio

The test spawns `clawmasons acp --role chapter-creator` with `stdio: ['pipe', 'pipe', 'pipe']`. The spawned process's stdin/stdout are converted to Web Streams and wrapped with `ndJsonStream()` to create a `ClientSideConnection`.

```
spawn() --> child.stdin / child.stdout --> Writable.toWeb() / Readable.toWeb() --> ndJsonStream() --> ClientSideConnection
```

The `ClientSideConnection` constructor takes a `(agent: Agent) => Client` factory and a `Stream`. The client factory returns a `Client` implementation -- for E2E tests we provide no-op handlers since we don't expect the bridge to call back into the test client for things like `requestPermission`.

### 2. Readiness detection via initialize response

Instead of polling an HTTP health endpoint, readiness is detected by the `initialize` response itself. The `ClientSideConnection.initialize()` call blocks until the bridge responds. The bridge handles `initialize` locally (no container needed), so this effectively replaces the health poll.

The bridge startup (chapter bootstrap, Docker build) happens before `initialize` can respond because the bridge calls `AgentSideConnection` which reads from stdin -- it only starts reading after setup is complete. We keep the generous timeout on the test that covers bootstrap.

### 3. Session start detection via newSession response

Instead of polling a log file for "Bridge connected to agent", the `newSession()` call blocks until the bridge has started the container, forwarded `initialize` + `session/new` to it, and received the container's response. This is a cleaner signal.

### 4. Tool verification via prompt

Instead of sending a raw `{ command: "list" }` HTTP body, the test sends a `prompt()` request. The agent's prompt handler lists available MCP tools and returns them. We verify the response contains tool information.

### 5. Graceful shutdown

Instead of checking that an HTTP endpoint returns connection-refused after SIGTERM, we verify that the process exits cleanly (exit code 0). The `connection.closed` promise resolves when the process's stdio closes.

### 6. Credential verification unchanged

The credential resolution test still uses `docker ps` + `docker logs` since it inspects container-internal logs. This is orthogonal to the protocol transport change.

## Component Interactions

```
Test Process                              clawmasons acp process
    |                                           |
    |-- spawn (stdio: pipe) ------------------->|
    |                                           | (bootstrap: lodge, chapter, Docker)
    |                                           |
    |-- ClientSideConnection ------------------>| AgentSideConnection (bridge)
    |     initialize() ----------------------->|
    |     <-- InitializeResponse --------------|   (local response, no container)
    |                                           |
    |     newSession({ cwd }) ----------------->|
    |                                           |-- docker compose run (piped stdio) --> Container
    |                                           |     initialize() ---------> AgentSideConnection
    |                                           |     newSession() ---------> AgentSideConnection
    |     <-- NewSessionResponse ---------------|
    |                                           |
    |     prompt() ---------------------------->|
    |                                           |-- prompt() --> Container
    |     <-- PromptResponse -------------------|
    |                                           |
    |-- SIGTERM -------------------------------->|
    |     <-- exit(0) --------------------------|
```
