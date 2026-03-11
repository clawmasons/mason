## Context

The orchestrator (`run-acp-agent.ts`) is the entry point for `clawmasons acp`. It resolves agents, starts infrastructure (proxy), creates the bridge, and wires lifecycle events. After Changes 1-3, the bridge module exports `AcpSdkBridge` (not `AcpBridge`), `stdio-bridge.ts` is deleted, and the session module has `startAgentProcess()`. The orchestrator must be updated to use these new APIs.

The `AcpSdkBridge` API:
- Constructor takes `{ onSessionNew, logger }` -- no port/host configuration
- `start(editorInput, editorOutput)` -- accepts Web Streams for editor-facing transport
- `stop()` -- cleans up all connections
- `closed` -- promise that resolves when editor disconnects

The session `startAgentProcess(cwd)` API:
- Returns `{ child: ChildProcess, agentInfo: AgentSessionInfo }`
- No `-d` flag, no port exposure

## Goals / Non-Goals

**Goals:**
- Wire `AcpSdkBridge` with `onSessionNew` callback
- Remove all HTTP transport code (`--transport`, `--port`, `StdioBridge`, `AcpBridge`)
- Keep process alive via `bridge.closed` promise
- Remove `acpPort` from session config (it's deprecated)
- Remove `"--port"` from `acpCommand`
- Update tests to match new API

**Non-Goals:**
- Changing the bootstrap flow
- Changing credential service wiring
- Changing agent/role resolution

## Decisions

### 1. Bridge wiring

The orchestrator creates `AcpSdkBridge` with an `onSessionNew` callback. The callback:
1. Creates `.clawmasons/` in the CWD
2. Ensures `.gitignore` entry
3. Calls `session.startAgentProcess(cwd)` to get a child process
4. Returns `child` to the bridge (bridge handles ClientSideConnection creation)

This is simpler than the old flow which required `session.startAgent(cwd)` + `bridge.connectToAgent()`.

### 2. Process lifecycle

The old orchestrator stayed alive via the HTTP bridge server. The new orchestrator uses `await bridge.closed` which resolves when the editor disconnects. Shutdown triggers kill child process via `bridge.stop()` and `session.stop()`.

### 3. Editor-facing streams

The bridge's `start()` method needs Web Streams. We use:
```typescript
const editorInput = Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>;
const editorOutput = Writable.toWeb(process.stdout) as WritableStream<Uint8Array>;
bridge.start(editorInput, editorOutput);
```

### 4. acpCommand simplification

The `acpCommand` no longer includes `--port`. For `claude-code` runtime, `ACP_RUNTIME_COMMANDS["claude-code"]` returns `"node src/index.js --acp"`, so `acpCommand` becomes `["src/index.js", "--acp"]` (removing the leading `node` and no `--port` suffix).

### 5. RunAcpAgentDeps update

`createBridgeFn` changes from `(config: AcpBridgeConfig) => AcpBridge` to `(config: AcpSdkBridgeConfig) => AcpSdkBridge`. Tests provide mock bridges matching the `AcpSdkBridge` interface.

### 6. Lifecycle events

The old bridge had `onClientConnect`, `onClientDisconnect`, `onAgentError`, `onSessionNew` callbacks. The new `AcpSdkBridge` handles all of this internally:
- Session new: via `onSessionNew` callback in config
- Client disconnect: via `bridge.closed` promise
- Agent error: via internal container crash recovery

The orchestrator no longer needs to set these callbacks. The `onSessionNew` callback in the bridge config replaces the old `bridge.onSessionNew` assignment.

### 7. Help text cleanup

Remove "Transport Modes" section and HTTP transport example from the help epilog. Keep the stdio ACP client configuration example.

## API Surface

```typescript
// Updated types
export interface RunAcpAgentOptions {
  agent?: string;
  role: string;
  proxyPort?: number;
  chapter?: string;
  initAgent?: string;
  // Removed: port, transport
}

export interface RunAcpAgentDeps {
  // ... existing deps ...
  createBridgeFn?: (config: AcpSdkBridgeConfig) => AcpSdkBridge;
  // Removed: createBridgeFn with AcpBridgeConfig
}
```
