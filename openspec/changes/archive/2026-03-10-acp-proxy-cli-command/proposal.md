# Proposal: `chapter acp-proxy` CLI Command

**Date:** 2026-03-10
**Change:** #9 from [ACP Proxy IMPLEMENTATION](../../../prds/acp-proxy/IMPLEMENTATION.md)
**PRD Refs:** REQ-001 (`chapter acp-proxy` CLI Command), PRD 7.3 (Startup Sequence)

## Problem

The ACP proxy has all its building blocks implemented (matcher, rewriter, warnings, session, bridge) but no user-facing entry point. An operator cannot yet run `chapter acp-proxy` to start a governed ACP endpoint for editors to connect to.

## Proposal

Create `packages/cli/src/cli/commands/acp-proxy.ts` -- the top-level CLI command that wires together all existing ACP modules into a complete workflow:

1. Discovers and resolves the agent from the workspace
2. Computes tool filters
3. Starts the ACP bridge endpoint and waits for an ACP client
4. On client connect: matches mcpServers, rewrites config, extracts credentials, starts Docker session, connects bridge to container agent
5. On client disconnect: tears down session
6. On SIGTERM/SIGINT: graceful shutdown

Register the command in `packages/cli/src/cli/commands/index.ts`.

## Scope

- New file: `packages/cli/src/cli/commands/acp-proxy.ts`
- Modify: `packages/cli/src/cli/commands/index.ts` -- register the acp-proxy command
- New test: `packages/cli/tests/cli/acp-proxy.test.ts`
