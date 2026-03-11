## Context

The ACP bridge sits between the editor (which communicates via stdin/stdout ndjson) and the container agent (which also speaks ndjson on its stdin/stdout). The bridge's job is deferred startup (handle `initialize` locally, start the container on `session/new`) and bidirectional message forwarding.

The current implementation uses two HTTP servers and the `StdioBridge` class. Changes 1 and 2 have already replaced the container agent's HTTP server with `AgentSideConnection` and added `startAgentProcess()` to the session module. This change completes the bridge side.

The SDK provides:
- `AgentSideConnection(toAgent, stream)` -- agent-side endpoint, takes a factory `(conn) => Agent`
- `ClientSideConnection(toClient, stream)` -- client-side endpoint, takes a factory `(agent) => Client`
- `ndJsonStream(output, input)` -- creates a `Stream` from Web Streams
- `connection.signal` / `connection.closed` -- lifecycle management

## Goals / Non-Goals

**Goals:**
- Replace the HTTP relay bridge with SDK dual-connection architecture
- Preserve deferred startup: `initialize` returns locally, `session/new` triggers container start
- Forward all ACP methods (`prompt`, `cancel`, etc.) bidirectionally
- Forward notifications bidirectionally (REQ-SDK-010)
- Detect editor disconnection via `connection.signal`/`connection.closed` (REQ-SDK-009)
- Detect container crash and recover for next session (REQ-SDK-013)
- Remove `stdio-bridge.ts` entirely
- Maintain backward-compatible exports for Change 4 transition

**Non-Goals:**
- Updating `run-acp-agent.ts` (Change 4)
- E2E test changes (Change 5)
- Full ACP capability negotiation (the bridge passes through what the container agent supports)

## Decisions

### 1. AcpSdkBridge class architecture

The `AcpSdkBridge` class encapsulates the dual-connection pattern:

```
Editor stdin/stdout  -->  AgentSideConnection (editor-facing)
                              |
                          AcpSdkBridge (mediates)
                              |
Child process stdio  -->  ClientSideConnection (container-facing)
```

Constructor takes:
- `onSessionNew: (cwd: string) => ChildProcess | Promise<ChildProcess>` -- callback to start container
- `logger?: AcpLogger` -- optional diagnostic logger

The bridge creates the `AgentSideConnection` in `start()` using provided streams (or process.stdin/stdout). The `ClientSideConnection` is created lazily on `session/new`.

### 2. Agent interface implementation (editor-facing)

The bridge implements the `Agent` interface for the `AgentSideConnection`:

- **`initialize`**: Returns immediately with local capabilities (`protocolVersion: "2025-03-26"`, `agentInfo: { name: "clawmasons", version: "1.0.0" }`). Does NOT start the container.
- **`newSession`**: Calls `onSessionNew(cwd)` to get a `ChildProcess`, creates `ClientSideConnection` from child's piped stdio, forwards `initialize` + `session/new` to the container, returns the container's response.
- **`prompt`** and other methods: Forward to container via `ClientSideConnection`, return response.
- **`cancel`**: Forward as notification to container.

### 3. Notification forwarding

Bidirectional notification forwarding is set up when the `ClientSideConnection` is created:

- Container-to-editor: The `Client` implementation passed to `ClientSideConnection` receives `sessionUpdate` and other notifications from the container, and forwards them via `editorConnection.sessionUpdate()`.
- Editor-to-container: The bridge's `Agent.cancel` handler forwards cancel notifications to `containerConnection.cancel()`.

For extension notifications, both directions use `extNotification`.

### 4. Container crash recovery

When the container process exits unexpectedly:
1. The child process emits `exit` or `error` events
2. `ClientSideConnection.closed` resolves
3. The bridge cleans up the `ClientSideConnection` reference
4. The bridge remains ready for a new `session/new`

The editor-facing `AgentSideConnection` persists across sessions.

### 5. Stream abstraction for testability

Instead of hardcoding `process.stdin`/`process.stdout`, the `start()` method accepts optional `editorInput` and `editorOutput` parameters (Web Streams). Tests provide mock streams; production uses the process streams.

### 6. Backward compatibility

For Change 4, we keep the old `AcpBridge` and `AcpBridgeConfig` exports temporarily as deprecated aliases. The `parseRequestBody` and `extractCwdFromBody` functions are removed since they were only used within the old bridge and tests.

**Update:** After further consideration, we do NOT keep backward-compatible aliases. The orchestrator (`run-acp-agent.ts`) will be updated in Change 4 to use `AcpSdkBridge` directly. The old exports are removed cleanly in this change. The orchestrator will have temporary TypeScript errors until Change 4 is applied, but since we run the same branch, both changes land together or the tests in `run-acp-agent.test.ts` are expected to fail until Change 4.

Since this is a sequential implementation plan and Change 4 depends on Change 3, we accept that `run-acp-agent.ts` will have broken imports after this change. The verification step will check only the bridge module's own tests and types.

## API Surface

```typescript
export interface AcpSdkBridgeConfig {
  /** Callback to start the container process. Returns a ChildProcess with piped stdio. */
  onSessionNew: (cwd: string) => ChildProcess | Promise<ChildProcess>;
  /** Optional logger for diagnostics. */
  logger?: AcpLogger;
}

export class AcpSdkBridge {
  constructor(config: AcpSdkBridgeConfig);

  /** Start the bridge with the given editor-facing streams. */
  start(editorInput: ReadableStream<Uint8Array>, editorOutput: WritableStream<Uint8Array>): void;

  /** Promise that resolves when the editor connection closes. */
  get closed(): Promise<void>;

  /** Stop the bridge and clean up all connections. */
  async stop(): Promise<void>;
}
```
