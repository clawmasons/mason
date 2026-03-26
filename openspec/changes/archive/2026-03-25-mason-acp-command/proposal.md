## Why

Editor extensions (VS Code, Zed, etc.) need a standardized way to communicate with mason agents. The Agent Client Protocol (ACP) defines this standard, and the `@agentclientprotocol/sdk` provides a TypeScript SDK for it. After removing the old non-functional ACP code (Change 1), we need a new `mason acp` CLI command that starts a proper ACP agent using the official SDK. This change implements the command and the `initialize` handler — the first runnable ACP artifact that editors can connect to and negotiate capabilities with.

## What Changes

- New file: `packages/cli/src/acp/acp-command.ts` — registers `mason acp` as a top-level CLI command. Redirects console output to stderr, creates an `AgentSideConnection` with stdio transport (`ndJsonStream`), and waits for the connection to close.
- New file: `packages/cli/src/acp/acp-agent.ts` — `createMasonAcpAgent(conn)` factory that returns an `Agent` implementation. The `initialize` handler returns protocol version, agent capabilities (loadSession, promptCapabilities, mcpCapabilities, sessionCapabilities), and agentInfo (name, title, version from package.json). All other handlers are stubs that throw `MethodNotFound` errors.
- Modify: `packages/cli/src/cli/commands/index.ts` — import and call `registerAcpCommand(program)`.
- New test: `packages/cli/tests/acp/acp-agent.test.ts` — creates in-memory stream pairs using `TransformStream`, connects `AgentSideConnection` + `ClientSideConnection`, sends `initialize`, and verifies the response capabilities and agentInfo.

## Capabilities

### New Capabilities
- `acp-command`: A `mason acp` CLI command that starts an ACP stdio server, enabling editor extensions to communicate with mason via JSON-RPC 2.0.
- `acp-initialize`: The `initialize` handler returns mason's capabilities and agent info per the ACP specification.

## Impact

- **New files:** 2 source files, 1 test file
- **Modified files:** `packages/cli/src/cli/commands/index.ts` — 2 lines added (import + register call)
- **No removed files**
- **No behavioral changes** to existing commands
- **Console output redirected to stderr** only while `mason acp` is running (stdout reserved for ACP protocol messages)
