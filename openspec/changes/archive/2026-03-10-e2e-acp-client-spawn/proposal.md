## Why

There is no E2E test that validates the full ACP client integration path: spawning `clawmasons acp --role writer` as a child process (the same way ACP clients like acpx and Zed do), triggering session/new, and verifying the agent responds to requests. This gap means regressions in the ACP client startup flow would go undetected.

## What Changes

- New: `e2e/tests/acp-client-spawn.test.ts` — E2E test suite that simulates an ACP client
- Tests spawn `clawmasons acp --role writer` as a child process with custom port
- Sends HTTP POST to the ACP bridge to trigger session/new with a temp CWD
- Verifies agent starts, tools are listed, filesystem tools can be invoked
- Verifies graceful shutdown on SIGTERM
- Uses the existing `mcp-note-taker` fixture with `mcp-agent` runtime (no LLM required)

## Capabilities

### New Capabilities
- `e2e-acp-client-spawn`: E2E test validating the full ACP client integration path from process spawn through session lifecycle

## Impact

- `e2e/tests/acp-client-spawn.test.ts` — new file
- `openspec/prds/clawmasons-cli/IMPLEMENTATION.md` — marks Change 9 as implemented

## PRD refs

- REQ-004 (Bootstrap Flow acceptance criteria)
- US-1 (Single-command ACP setup)
