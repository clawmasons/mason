## Why

The container agent (`packages/mcp-agent`) currently exposes an HTTP server (`acp-server.ts`) on port 3002 to receive commands from the ACP bridge. This is a non-standard, bespoke wire protocol (`{ command: string }` / `{ output, exit }`) that does not speak the ACP JSON-RPC protocol. It requires Docker port exposure, creates port collision risks, and adds unnecessary HTTP complexity.

The `@agentclientprotocol/sdk` provides `AgentSideConnection` and `ndJsonStream` -- a transport-agnostic, stream-based ACP protocol implementation. By replacing the HTTP server with `AgentSideConnection` on stdin/stdout, the container agent becomes a proper ACP endpoint that reads/writes ndjson protocol messages directly.

## What Changes

- Create `packages/mcp-agent/src/acp-agent.ts` implementing the SDK `Agent` interface (`initialize`, `newSession`, `prompt`) backed by the existing `ToolCaller`
- Modify `packages/mcp-agent/src/index.ts`: when `--acp` is passed, redirect `console.log` to stderr (stdout protection), create `AgentSideConnection` with `ndJsonStream()` on stdin/stdout instead of calling `startAcpServer()`
- Remove `--port` flag acceptance when `--acp` is specified
- Remove `packages/mcp-agent/src/acp-server.ts`
- Add `@agentclientprotocol/sdk` dependency to `packages/mcp-agent/package.json`

## Capabilities

### New Capabilities
- `acp-agent`: ACP agent implementation using `AgentSideConnection` from the SDK, with `initialize`, `newSession`, and `prompt` handlers delegating to `ToolCaller`

### Modified Capabilities
- `mcp-agent-package`: ACP mode switches from HTTP server to stdin/stdout ndjson via SDK; `--port` flag removed for ACP mode; stdout protection added

### Removed Capabilities
- `acp-server`: HTTP server (`acp-server.ts`) removed entirely -- replaced by SDK-based `AgentSideConnection`

## Impact

- **New file:** `packages/mcp-agent/src/acp-agent.ts` -- Agent interface implementation
- **Modified file:** `packages/mcp-agent/src/index.ts` -- ACP mode startup logic
- **Removed file:** `packages/mcp-agent/src/acp-server.ts` -- HTTP server
- **New test:** `packages/mcp-agent/tests/acp-agent.test.ts` -- spawns agent with `--acp`, verifies ACP protocol via stdin/stdout
- **New dependency:** `@agentclientprotocol/sdk` in `packages/mcp-agent/package.json`
