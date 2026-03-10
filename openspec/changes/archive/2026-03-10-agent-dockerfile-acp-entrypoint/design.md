# Design: Agent Dockerfile ACP Entrypoint

**Date:** 2026-03-10

## Approach

Refactored `getRuntimeConfig()` into two functions:
1. `getBaseRuntimeConfig(runtime)` -- returns the standard install + entrypoint (unchanged behavior)
2. `getRuntimeConfig(runtime, acpMode)` -- delegates to base, then overrides entrypoint when `acpMode` is true

ACP command resolution uses `ACP_RUNTIME_COMMANDS` from `materializer/common.ts` (single source of truth). The ACP command string is split by spaces into a JSON array for proper Dockerfile `ENTRYPOINT` format.

## Entrypoint Mapping

| Runtime | Default | ACP |
|---------|---------|-----|
| claude-code | `["claude"]` | `["claude-agent-acp"]` |
| pi-coding-agent | `["pi"]` | `["pi-agent-acp"]` |
| node | `["npx", "node"]` | `["node", "src/index.js", "--acp"]` |
| unknown | `["npx", "<runtime>"]` | same (with warning comment) |

## Backward Compatibility

- `options` parameter is optional; omitting it or passing `{ acpMode: false }` produces identical output to the previous implementation.
- No changes to the function's return type or the Dockerfile structure beyond the entrypoint line and header comment.
