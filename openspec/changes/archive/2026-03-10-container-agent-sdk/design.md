## Context

The container agent (`packages/mcp-agent`) is a Node.js process that runs inside a Docker container. It currently has two modes: REPL (interactive stdin/stdout) and ACP (HTTP server on port 3002). The ACP mode uses a bespoke `{ command: string }` HTTP protocol via `acp-server.ts`.

The `@agentclientprotocol/sdk` provides `AgentSideConnection` which accepts an `Agent` interface implementation and a `Stream` (created via `ndJsonStream()`). This gives us a protocol-compliant ACP endpoint that reads/writes ndjson on stdin/stdout.

The existing `ToolCaller` abstraction already provides `listTools()` and `callTool()` -- we adapt these into the ACP `Agent.prompt` handler.

## Goals / Non-Goals

**Goals:**
- Replace the HTTP server with `AgentSideConnection` on stdin/stdout
- Implement the SDK `Agent` interface backed by `ToolCaller`
- Protect stdout from non-protocol output when in ACP mode
- Remove `--port` flag for ACP mode
- Remove `acp-server.ts`

**Non-Goals:**
- Full LLM-driven prompt handling (the agent returns tool list, not LLM responses)
- Session persistence or `loadSession` support
- Bridge-side changes (separate CHANGE 2/3)
- Docker compose port changes (separate CHANGE 2)

## Decisions

### 1. Agent interface: minimal tool-listing prompt handler

The `prompt` handler lists available MCP tools and returns them as a text message. This preserves the current behavior where the bridge/client asks "what tools do you have?" and gets a list. The agent does not run an LLM -- it exposes MCP tools to the ACP client.

For `initialize`: returns protocol version and empty capabilities (no `loadSession`, no `forkSession`).
For `newSession`: triggers credential resolution and proxy connection (deferred from startup), generates a session ID, returns it.
For `prompt`: calls `listTools()` on the `ToolCaller` and returns the list as an `end_turn` response with a `session/update` notification containing the tool information.

### 2. Stdout protection via console.log redirect

When `--acp` is specified, before creating the `AgentSideConnection`, we replace `console.log` with a function that writes to stderr. This ensures only ACP ndjson appears on stdout. We use `console.error` for all diagnostic output.

Implementation: `const originalLog = console.log; console.log = (...args) => console.error(...args);`

### 3. Web Streams conversion

`ndJsonStream()` expects `WritableStream<Uint8Array>` and `ReadableStream<Uint8Array>` (Web Streams API). We convert Node.js streams:
- Output (agent writes to stdout): `Writable.toWeb(process.stdout)`
- Input (agent reads from stdin): `Readable.toWeb(process.stdin)`

Note: per the SDK example, the first argument to `ndJsonStream` is the output (writable) and the second is the input (readable).

### 4. Deferred caller pattern preserved

The current code creates a "deferred caller" that starts returning real results once the MCP proxy connection is established. We keep this pattern but trigger it differently: in the HTTP server version, the server starts immediately and the proxy connects in the background. In the SDK version, the `AgentSideConnection` starts immediately, and `newSession` blocks on credential resolution + proxy connection before responding.

### 5. File structure

- `acp-agent.ts`: exports `createAcpAgent(caller: ToolCaller): (conn: AgentSideConnection) => Agent` factory function
- `index.ts`: in ACP mode, creates the connection using `AgentSideConnection` + `ndJsonStream`
- `acp-server.ts`: deleted

## Component Interactions

```
stdin (ndjson) --> Readable.toWeb(process.stdin) --> ndJsonStream() --> AgentSideConnection
                                                                          |
                                                                     AcpAgent (Agent interface)
                                                                          |
                                                                     ToolCaller
                                                                          |
stdout (ndjson) <-- Writable.toWeb(process.stdout) <-- ndJsonStream() <--'
```
