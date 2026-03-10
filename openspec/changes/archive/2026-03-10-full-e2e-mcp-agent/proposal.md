## Why

Current e2e tests can't exercise the full agent pipeline (build → run → tool calls) because they require an LLM token. The `mcp-agent` package provides a lightweight tool-calling agent that works without an LLM, making fully automated e2e tests possible. Additionally, `run-agent` has a bug where it uses `docker compose up` instead of `docker compose run`, making the terminal unresponsive for interactive agents.

## What Changes

- Create `mcp-note-taker` test fixture agent using `mcp-agent` runtime with scoped `@test/role-writer` permissions
- Register the existing `mcpAgentMaterializer` in `docker-init.ts` so `mcp-agent` runtime agents get workspace files (`.mcp.json`, `AGENTS.md`)
- Add `mcp-agent` as a recognized runtime in `agent-dockerfile.ts` and `ACP_RUNTIME_COMMANDS`
- **Fix bug**: Change `run-agent` from `docker compose up` to `docker compose run --rm --service-ports` for interactive agent sessions
- Create `test-note-taker-mcp.test.ts` e2e test with two suites:
  - Proxy tool pipeline (run-agent equivalent): direct MCP tool calls through governed proxy
  - ACP agent mode: tool calls via `acpx` CLI client (https://github.com/openclaw/acpx)
- Add `acpx` as an e2e dev dependency

## Capabilities

### New Capabilities
- `e2e-mcp-agent-tests`: Full e2e test coverage using mcp-agent to exercise build → run → tool call pipeline without LLM tokens

### Modified Capabilities
- `docker-compose-generation`: Register `mcpAgentMaterializer` for `mcp-agent` runtime and add runtime config to Dockerfile generator
- `run-agent-command`: Fix interactive agent startup to use `docker compose run` instead of `docker compose up`

## Impact

- `packages/cli/src/cli/commands/run-agent.ts` — bug fix for interactive mode
- `packages/cli/src/cli/commands/docker-init.ts` — materializer registration
- `packages/cli/src/generator/agent-dockerfile.ts` — new runtime case
- `packages/cli/src/materializer/common.ts` — ACP runtime command mapping
- `e2e/fixtures/test-chapter/agents/mcp-note-taker/` — new fixture
- `e2e/tests/test-note-taker-mcp.test.ts` — new e2e test
- `e2e/package.json` — new acpx dependency
