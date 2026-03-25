## Context

This is Change 3 of the `acp-refactor` PRD. Change 1 removed the old ACP code, Change 2 added the session storage module. This change creates the `mason acp` CLI command and the `initialize` handler — the minimum viable ACP agent that editors can connect to and negotiate capabilities with.

The `@agentclientprotocol/sdk` (v0.16.x) provides `AgentSideConnection`, `ClientSideConnection`, `ndJsonStream`, and `PROTOCOL_VERSION`. The SDK handles JSON-RPC 2.0 framing, method routing, and error handling automatically.

## Goals / Non-Goals

**Goals:**
- Register `mason acp` as a top-level CLI command
- Create an `AgentSideConnection` using stdio transport (stdin/stdout via `ndJsonStream`)
- Implement the `initialize` handler returning correct capabilities and agentInfo
- Store `clientCapabilities` from the request for future use
- Redirect `console.log`/`console.error` to stderr so stdout is exclusively ACP protocol messages
- Provide stub handlers for all other ACP methods that throw appropriate errors
- Unit test the initialize handler via in-memory stream pairs

**Non-Goals:**
- Implementing `session/new`, `session/prompt`, or any other session handlers (Changes 4-6)
- Adding session storage integration (Change 2 provides the module, Change 4 integrates it)
- HTTP transport (out of scope per PRD)

## Decisions

### 1. Console redirection strategy

Before creating the `AgentSideConnection`, redirect `console.log` and `console.error` to write to `process.stderr` instead of their defaults. This ensures no diagnostic output pollutes the ACP protocol stream on stdout. We use `new console.Console(process.stderr, process.stderr)` and replace the global console.

### 2. Stream creation for stdio

The SDK's `ndJsonStream` expects Web Streams API (`WritableStream<Uint8Array>` and `ReadableStream<Uint8Array>`). Node.js provides `Writable.toWeb()` and `Readable.toWeb()` to convert native streams. Per the SDK example:
```typescript
const input = Writable.toWeb(process.stdout);   // agent writes to stdout
const output = Readable.toWeb(process.stdin);    // agent reads from stdin
const stream = ndJsonStream(input, output);
```

### 3. Agent factory pattern

The `AgentSideConnection` constructor takes a factory function `(conn: AgentSideConnection) => Agent`. We implement `createMasonAcpAgent(conn)` that returns an object satisfying the `Agent` interface. The connection reference is stored for future use (sending `sessionUpdate` notifications in later changes).

### 4. Initialize response values

Per PRD REQ-004 and the SDK types:
- `protocolVersion`: Use `PROTOCOL_VERSION` constant from the SDK (value: 1)
- `agentCapabilities.loadSession`: `true`
- `agentCapabilities.promptCapabilities`: `{ image: true, audio: false, embeddedContext: true }`
- `agentCapabilities.mcpCapabilities`: `{ http: true, sse: false }`
- `agentCapabilities.sessionCapabilities`: `{ list: {}, stop: {} }` (SDK uses `stop` not `close`)
- `agentInfo`: `{ name: "mason", title: "Mason", version: "<from package.json>" }`

Note: The PRD uses `close` but the SDK type uses `stop` for session close capabilities. We align with the SDK type.

### 5. Client capabilities storage

Store `clientCapabilities` and `clientInfo` from the `InitializeRequest` in a module-level variable accessible to future handlers. This allows checking if the client supports `fs`, `terminal`, etc.

### 6. Stub handlers

All non-initialize handlers (`newSession`, `prompt`, `cancel`, `loadSession`, `listSessions`, `unstable_closeSession`, `setSessionConfigOption`, `authenticate`, `setSessionMode`) throw `RequestError.methodNotFound()` or return minimal valid responses. This allows the agent to start and respond to `initialize` without implementing session logic yet.

### 7. Version from package.json

Read the CLI package version using `createRequire(import.meta.url)` to import `package.json`. This is the standard pattern for ESM modules to read their own package metadata.

## File Structure

```
packages/cli/src/acp/
├── acp-command.ts     # registerAcpCommand(program) — CLI registration + stdio setup
└── acp-agent.ts       # createMasonAcpAgent(conn) — Agent factory with initialize handler

packages/cli/tests/acp/
└── acp-agent.test.ts  # Unit tests for initialize handler
```

## Test Coverage

### Unit tests (`packages/cli/tests/acp/acp-agent.test.ts`)

1. **Initialize returns correct protocol version** — Send `initialize` with `protocolVersion: 1`, verify response has `protocolVersion: 1`.
2. **Initialize returns correct agent capabilities** — Verify `loadSession`, `promptCapabilities`, `mcpCapabilities`, `sessionCapabilities` match expected values.
3. **Initialize returns correct agentInfo** — Verify `name: "mason"`, `title: "Mason"`, and `version` matches CLI package version.
4. **Initialize stores client capabilities** — Send `initialize` with `clientCapabilities`, verify they are stored and accessible.

### Test approach

Tests use the SDK's `ClientSideConnection` on one side and `AgentSideConnection` on the other, connected via in-memory `TransformStream` pairs (Web Streams API). This tests the full protocol path without spawning a subprocess.

```typescript
// Create in-memory bidirectional streams
const clientToAgent = new TransformStream<Uint8Array>();
const agentToClient = new TransformStream<Uint8Array>();

// Agent side: reads from clientToAgent, writes to agentToClient
const agentStream = ndJsonStream(agentToClient.writable, clientToAgent.readable);
const agentConn = new AgentSideConnection((conn) => createMasonAcpAgent(conn), agentStream);

// Client side: reads from agentToClient, writes to clientToAgent
const clientStream = ndJsonStream(clientToAgent.writable, agentToClient.readable);
const clientConn = new ClientSideConnection(() => ({ ... }), clientStream);

// Send initialize
const response = await clientConn.initialize({ protocolVersion: 1, clientCapabilities: {} });
```
