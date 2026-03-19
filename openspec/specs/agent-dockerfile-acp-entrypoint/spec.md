# Agent Dockerfile ACP Entrypoint

**Status:** Implemented
**PRD:** [acp-proxy](../../prds/acp-proxy/PRD.md)
**Change:** #6 — Agent Dockerfile ACP Entrypoint
**PRD Refs:** REQ-006 (Container ACP Agents)

---

## Problem

The agent Dockerfile generator (`agent-dockerfile.ts`) currently produces containers with a fixed entrypoint that runs the agent runtime directly (e.g., `ENTRYPOINT ["claude"]` for Claude Code). For ACP mode, the container must instead start the ACP agent wrapper command (e.g., `claude-agent-acp`) so that the agent listens for incoming ACP connections rather than running interactively.

## Solution

Extend `generateAgentDockerfile()` to accept an optional `acpMode` flag. When `acpMode` is true, the function uses `ACP_RUNTIME_COMMANDS` (from `materializer/common.ts`) to determine the correct ACP entrypoint instead of the default runtime entrypoint.

### Interface Change

```typescript
export function generateAgentDockerfile(
  agent: ResolvedAgent,
  role: ResolvedRole,
  options?: { acpMode?: boolean },
): string;
```

### Behavior

| Runtime | Default Entrypoint | ACP Entrypoint |
|---------|-------------------|----------------|
| `claude-code-agent` | `ENTRYPOINT ["claude"]` | `ENTRYPOINT ["claude-agent-acp"]` |
| `pi-coding-agent` | `ENTRYPOINT ["pi"]` | `ENTRYPOINT ["pi-agent-acp"]` |
| `node` | `ENTRYPOINT ["npx", "node"]` | `ENTRYPOINT ["node", "src/index.js", "--acp"]` |
| unknown runtime | `ENTRYPOINT ["npx", "<runtime>"]` | `ENTRYPOINT ["npx", "<runtime>"]` (unchanged, with warning comment) |

### Key Details

1. `ACP_RUNTIME_COMMANDS` from `materializer/common.ts` is the single source of truth for ACP command mapping.
2. When `acpMode` is true but no ACP command mapping exists for the runtime, the Dockerfile falls back to the default entrypoint with a comment noting ACP mode was requested but no mapping was found.
3. The ACP entrypoint is split into an array for proper `ENTRYPOINT` JSON form (e.g., `"node src/index.js --acp"` becomes `["node", "src/index.js", "--acp"]`).
4. The Dockerfile header comment indicates ACP mode when active (e.g., `# Agent Dockerfile for note-taker (role: writer) [ACP mode]`).
5. When `acpMode` is false or omitted, behavior is identical to today (no regression).

## Files

- **Modify:** `packages/cli/src/generator/agent-dockerfile.ts`
- **Modify:** `packages/cli/tests/generator/agent-dockerfile.test.ts`
- **Read-only dependency:** `packages/cli/src/materializer/common.ts` (`ACP_RUNTIME_COMMANDS`)

## Test Plan

1. Non-ACP mode generates identical Dockerfile (regression guard)
2. ACP mode with `claude-code-agent` runtime uses `ENTRYPOINT ["claude-agent-acp"]`
3. ACP mode with `pi-coding-agent` runtime uses `ENTRYPOINT ["pi-agent-acp"]`
4. ACP mode with `node` runtime uses `ENTRYPOINT ["node", "src/index.js", "--acp"]`
5. ACP mode with unknown runtime falls back to default entrypoint
6. ACP mode Dockerfile header includes `[ACP mode]` marker
7. `acpMode: false` behaves same as omitted
8. ACP mode still installs the runtime (install step unchanged)
