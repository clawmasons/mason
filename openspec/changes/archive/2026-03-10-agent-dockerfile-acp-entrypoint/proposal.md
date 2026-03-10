# Proposal: Agent Dockerfile ACP Entrypoint

**Date:** 2026-03-10
**Change:** #6 from [ACP Proxy IMPLEMENTATION](../../../prds/acp-proxy/IMPLEMENTATION.md)
**PRD Refs:** REQ-006 (Container ACP Agents)

## Problem

The agent Dockerfile generator produces containers with fixed entrypoints (e.g., `ENTRYPOINT ["claude"]`). ACP mode requires different entrypoints (e.g., `claude-agent-acp`) so containers listen for ACP connections instead of running interactively.

## Proposal

Add an optional `acpMode` flag to `generateAgentDockerfile()`. When true, use `ACP_RUNTIME_COMMANDS` from `materializer/common.ts` to set the ACP-specific entrypoint. Fallback gracefully for unknown runtimes.

## Scope

- Modify: `packages/cli/src/generator/agent-dockerfile.ts`
- Modify: `packages/cli/tests/generator/agent-dockerfile.test.ts`
