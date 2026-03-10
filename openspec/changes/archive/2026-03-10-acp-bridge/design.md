# Design: ACP Bridge — Bidirectional ACP <-> Container Communication

**Date:** 2026-03-10

## Approach

The AcpBridge is a transparent HTTP reverse proxy that relays all requests/responses between a host-side endpoint (where ACP clients connect) and a container-side ACP agent endpoint (inside Docker).

### Architecture

```
ACP Client (editor)
    |
    v  HTTP (host port, e.g., 3001)
AcpBridge (host-side server)
    |
    v  HTTP (container host:port, e.g., localhost:3002)
ACP Agent (inside Docker container)
```

### Key Design Decisions

1. **Transparent HTTP Relay** -- The bridge does not parse or interpret ACP protocol messages. It proxies raw HTTP requests/responses. This keeps the bridge protocol-agnostic and forward-compatible with ACP protocol changes.

2. **Event-Based Lifecycle** -- The bridge emits events for client connects, disconnects, and agent errors. The orchestrator (future CHANGE 8/9) subscribes to these events for session lifecycle management.

3. **Connection Health** -- Before relaying, the bridge verifies the agent endpoint is reachable via `connectToAgent()`. If the agent connection drops, it emits `onAgentError` so the orchestrator can handle teardown.

4. **Single-Client Model** -- v1 supports one ACP client at a time (per PRD non-goal: no multi-agent sessions). Additional client connections are accepted but share the same agent relay.

### Class API

```typescript
interface AcpBridgeConfig {
  hostPort: number;          // Port to listen on for ACP clients (e.g., 3001)
  containerHost: string;     // Docker container hostname (e.g., "localhost")
  containerPort: number;     // ACP agent port inside container (e.g., 3002)
}

class AcpBridge {
  constructor(config: AcpBridgeConfig);
  start(): Promise<void>;           // Start host-side HTTP server
  connectToAgent(): Promise<void>;   // Verify agent endpoint is reachable
  stop(): Promise<void>;             // Tear down both sides

  // Event callbacks
  onClientConnect?: () => void;
  onClientDisconnect?: () => void;
  onAgentError?: (error: Error) => void;
}
```

### Request Flow

1. ACP client sends HTTP request to `localhost:{hostPort}/{path}`
2. Bridge receives request, tracks client connection
3. Bridge forwards request to `http://{containerHost}:{containerPort}/{path}`
4. Agent response is relayed back to the client
5. If the agent request fails (connection refused, timeout), bridge returns a 502 error and emits `onAgentError`

### Error Handling

| Error | Behavior |
|-------|----------|
| Agent not reachable on `connectToAgent()` | Throws with descriptive error |
| Agent drops mid-request | 502 response to client, emits `onAgentError` |
| Client disconnects | Emits `onClientDisconnect` |
| Bridge `stop()` called | Closes server, rejects in-flight requests |

### Backward Compatibility

This is a new module with no existing API to maintain. The bridge integrates with the existing `acp-server.ts` in the mcp-agent package (the container-side endpoint from CHANGE 3).
