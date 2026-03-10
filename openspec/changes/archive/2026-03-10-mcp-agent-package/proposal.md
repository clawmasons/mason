## Why

The existing `mcp-test` agent at `e2e/fixtures/test-chapter/agents/mcp-test/` is a useful tool for testing the credential and MCP tool pipeline, but it is an inline fixture rather than a proper reusable package. The ACP proxy needs a general-purpose MCP agent that can operate in both REPL mode (interactive tool calling) and ACP agent mode (listening for ACP connections). This agent should be formally packaged at `packages/mcp-agent/` so it can be built as a standalone binary for Docker images, used as the standard test/debug agent, and serve as the ACP agent implementation for the mcp-test workspace.

## What Changes

- New `packages/mcp-agent/` package — extracts and extends the existing mcp-test agent logic into a proper npm package with:
  - `src/index.ts` — main entry: mode detection (REPL vs ACP via `--acp` flag), proxy connection, tool listing, command parsing
  - `src/tool-caller.ts` — shared tool-calling logic: parse user input, call tools via MCP client, format responses, show help for unknown commands
  - `src/acp-server.ts` — ACP agent server: listens for ACP connections on a configurable port, routes incoming tool commands through tool-caller
  - `package.json` — `@clawmasons/mcp-agent`, bin: `mcp-agent`
  - esbuild config for bundling as a standalone binary (same pattern as agent-entry)
- Update `e2e/fixtures/test-chapter/agents/mcp-test/` — depend on `@clawmasons/mcp-agent` instead of inline implementation
- New unit tests: `packages/mcp-agent/tests/tool-caller.test.ts`

## Capabilities

### New Capabilities
- `mcp-agent-repl`: Interactive REPL mode for listing and calling MCP tools through the chapter proxy, with help message for unknown commands
- `mcp-agent-acp`: ACP agent mode that listens for incoming ACP connections and processes tool call requests

### Modified Capabilities
- `mcp-test-agent`: Updated to use the `@clawmasons/mcp-agent` package instead of inline implementation

## Impact

- **New directory:** `packages/mcp-agent/` (package with src, tests, esbuild config)
- **Modified file:** `e2e/fixtures/test-chapter/agents/mcp-test/package.json` — references `@clawmasons/mcp-agent`
- **Modified file:** `e2e/fixtures/test-chapter/agents/mcp-test/src/index.ts` — simplified to delegate to mcp-agent package
- **Modified file:** `tsconfig.json` — add mcp-agent paths
- **Modified file:** `vitest.config.ts` — add mcp-agent alias
- **No breaking changes** — existing e2e tests continue to work with the new package
