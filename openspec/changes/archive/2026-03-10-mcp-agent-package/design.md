## Context

The ACP proxy PRD (section 7.7) specifies an MCP ACP Agent materializer and a formal `packages/mcp-agent/` package that replaces the ad-hoc `mcp-test` agent fixture. This agent serves as both a test/debug agent and the standard MCP agent for ACP mode. It supports two modes: interactive REPL and ACP agent (listening for connections).

The existing `e2e/fixtures/test-chapter/agents/mcp-test/src/index.ts` contains ~300 lines of inline MCP client code, REPL logic, and tool calling. This change extracts that into a proper package with clean module separation.

## Goals / Non-Goals

**Goals:**
- Create `packages/mcp-agent/` as a proper npm package with esbuild bundling
- Split functionality into three modules: index (entry/mode detection), tool-caller (shared logic), acp-server (ACP mode)
- Support `--acp` flag for ACP agent mode with configurable port
- Show help message with available tools when an unrecognized command is entered
- Update mcp-test fixture to use the new package
- Unit tests for tool-caller logic (parsing, help generation)

**Non-Goals:**
- Full ACP protocol implementation (CHANGE 7/9 handles that)
- Materializer for mcp-agent (CHANGE 5)
- Docker integration (CHANGE 6/8)
- Credential session overrides (CHANGE 4)

## Decisions

### D1: Module structure — three files

**Choice:** Split into `index.ts` (entry point + REPL), `tool-caller.ts` (shared parsing + calling), `acp-server.ts` (ACP listener).

**Rationale:** The tool-calling logic (parse command string, call MCP tool, format result, generate help) is shared between REPL and ACP modes. Separating it enables unit testing without MCP client dependencies.

### D2: Lightweight MCP client stays inline

**Choice:** The MCP client logic (initialize session, list tools, call tools) remains in this package rather than importing from agent-entry.

**Rationale:** The agent-entry package has a different purpose (bootstrap flow for Docker containers). The mcp-agent needs its own lightweight client for both REPL and ACP modes. The code is small (~100 lines) and self-contained.

### D3: ACP server is a stub for now

**Choice:** The `acp-server.ts` creates a basic HTTP server that accepts POST requests with `{ command: string }` bodies. Full ACP protocol integration happens in CHANGE 7.

**Rationale:** The ACP wire protocol (Q1 in PRD open questions) is not yet defined. A simple HTTP command interface lets us test the pipeline end-to-end. CHANGE 7 (ACP Bridge) will define the real protocol.

### D4: Help message on unknown commands

**Choice:** When a user enters a command that doesn't match `list`, `exit`, `help`, or a known tool name, display a help message listing all available tools.

**Rationale:** PRD section 7.7 explicitly requires this: "if users type a command that does not match any tool, then they should see a help message with all the available tools."

### D5: mcp-test fixture delegates to mcp-agent

**Choice:** The mcp-test fixture's `src/index.ts` becomes a thin wrapper that imports and runs the mcp-agent's main function. The fixture's `package.json` adds `@clawmasons/mcp-agent` as a dependency.

**Rationale:** The fixture must remain as a test workspace package (with its own package.json declaring agent metadata). The implementation logic moves to the shared package.

## Design

### Package Structure

```
packages/mcp-agent/
  package.json          — @clawmasons/mcp-agent
  tsconfig.json
  tsconfig.build.json
  esbuild.config.ts     — bundles to dist/mcp-agent.js
  src/
    index.ts            — main entry, mode detection, REPL loop
    tool-caller.ts      — parse commands, call tools, format results, help
    acp-server.ts       — ACP HTTP server for --acp mode
    mcp-client.ts       — lightweight MCP client (init, list, call)
  tests/
    tool-caller.test.ts — unit tests for parsing and help
```

### tool-caller.ts

```typescript
interface ToolDefinition {
  name: string;
  description?: string;
}

interface ToolCallResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

interface ToolCaller {
  listTools(): Promise<ToolDefinition[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult>;
}

function parseCommand(input: string): { type: "list" | "exit" | "help" | "call"; toolName?: string; args?: Record<string, unknown> };
function formatResult(result: ToolCallResult): string;
function formatHelp(tools: ToolDefinition[]): string;
async function executeCommand(input: string, caller: ToolCaller): Promise<{ output: string; exit: boolean }>;
```

### mcp-client.ts

```typescript
interface McpClientConfig {
  proxyUrl: string;
  proxyToken: string;
}

function createMcpClient(config: McpClientConfig): Promise<ToolCaller>;
```

### index.ts (main entry)

```typescript
// CLI: mcp-agent [--acp] [--port <n>]
// - Without --acp: REPL mode (reads from stdin)
// - With --acp: starts ACP server on port (default 3002)

async function main(): Promise<void>;
```

### acp-server.ts

```typescript
interface AcpServerConfig {
  port: number;
  caller: ToolCaller;
}

function startAcpServer(config: AcpServerConfig): Promise<{ close: () => void }>;
```

### File Locations

- `packages/mcp-agent/src/index.ts` — entry point
- `packages/mcp-agent/src/tool-caller.ts` — shared logic
- `packages/mcp-agent/src/acp-server.ts` — ACP server
- `packages/mcp-agent/src/mcp-client.ts` — MCP client
- `packages/mcp-agent/tests/tool-caller.test.ts` — unit tests
- `e2e/fixtures/test-chapter/agents/mcp-test/src/index.ts` — updated to use package
- `e2e/fixtures/test-chapter/agents/mcp-test/package.json` — updated dependencies

### Dependencies

- No external dependencies beyond Node.js built-ins (`node:http`, `node:readline`)
- Dev dependencies: `esbuild`, `tsx` (same as agent-entry)
- Type-only dependency on `@clawmasons/shared` is NOT needed (this package is standalone)
