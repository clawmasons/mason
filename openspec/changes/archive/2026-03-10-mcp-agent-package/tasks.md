## 1. Package Scaffolding

- [x] 1.1 Create `packages/mcp-agent/package.json` with name `@clawmasons/mcp-agent`, bin `mcp-agent`, esbuild build script
- [x] 1.2 Create `packages/mcp-agent/tsconfig.json` and `tsconfig.build.json` (matching agent-entry pattern)
- [x] 1.3 Create `packages/mcp-agent/esbuild.config.ts` bundling `src/index.ts` to `dist/mcp-agent.js`
- [x] 1.4 Update root `tsconfig.json` to include mcp-agent paths
- [x] 1.5 Update root `vitest.config.ts` to include mcp-agent alias

## 2. Tool Caller Module

- [x] 2.1 Create `packages/mcp-agent/src/tool-caller.ts` with types: `ToolDefinition`, `ToolCallResult`, `ToolCaller` interface
- [x] 2.2 Implement `parseCommand(input)` — returns type (list/exit/help/call) and parsed tool name + args
- [x] 2.3 Implement `formatResult(result)` — formats tool call result for display
- [x] 2.4 Implement `formatHelp(tools)` — generates help message listing all available tools
- [x] 2.5 Implement `executeCommand(input, caller)` — orchestrates parse, call, and format

## 3. MCP Client Module

- [x] 3.1 Create `packages/mcp-agent/src/mcp-client.ts` with MCP session initialization
- [x] 3.2 Implement `createMcpClient(config)` — returns a ToolCaller backed by MCP over HTTP

## 4. ACP Server Module

- [x] 4.1 Create `packages/mcp-agent/src/acp-server.ts` with HTTP-based command server
- [x] 4.2 Implement `startAcpServer(config)` — listens on port, accepts POST with command body, returns result

## 5. Main Entry Point

- [x] 5.1 Create `packages/mcp-agent/src/index.ts` with CLI argument parsing (--acp, --port)
- [x] 5.2 Implement REPL mode — credential check, MCP client init, readline loop using executeCommand
- [x] 5.3 Implement ACP mode — start ACP server with tool caller

## 6. Update mcp-test Fixture

- [x] 6.1 Update `e2e/fixtures/test-chapter/agents/mcp-test/src/index.ts` to delegate to mcp-agent
- [x] 6.2 Update `e2e/fixtures/test-chapter/agents/mcp-test/package.json` to add mcp-agent dependency

## 7. Unit Tests

- [x] 7.1 Create `packages/mcp-agent/tests/tool-caller.test.ts`
- [x] 7.2 Test: parseCommand("list") returns { type: "list" }
- [x] 7.3 Test: parseCommand("exit") returns { type: "exit" }
- [x] 7.4 Test: parseCommand("help") returns { type: "help" }
- [x] 7.5 Test: parseCommand('my_tool {"key": "val"}') returns { type: "call", toolName: "my_tool", args: { key: "val" } }
- [x] 7.6 Test: parseCommand("my_tool") returns { type: "call", toolName: "my_tool", args: {} }
- [x] 7.7 Test: parseCommand("my_tool invalid-json") returns parse error
- [x] 7.8 Test: formatHelp generates help listing all tools
- [x] 7.9 Test: formatResult handles success and error results
- [x] 7.10 Test: executeCommand with "list" calls caller.listTools()
- [x] 7.11 Test: executeCommand with unknown command shows help
