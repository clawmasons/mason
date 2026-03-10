# Proposal: End-to-End ACP Integration Test

**Date:** 2026-03-10
**Change:** #11 from [ACP Proxy IMPLEMENTATION](../../../prds/acp-proxy/IMPLEMENTATION.md)
**PRD Refs:** PRD 8 UC-3 (End-to-End Testing with mcp Agent)

## Problem

All ACP proxy components (matcher, rewriter, warnings, session, bridge, CLI command, audit logging) have been implemented and unit-tested individually, but there is no integration test that exercises the full ACP pipeline end-to-end. Without this, regressions across component boundaries may go undetected.

## Proposal

Create `e2e/tests/acp-proxy.test.ts` -- a comprehensive integration test that exercises the complete ACP proxy lifecycle:

1. Sets up the test workspace (copy fixtures, pack, docker-init, run-init)
2. Starts the chapter proxy in a Docker container with ACP session metadata
3. Connects an MCP client through the proxy
4. Verifies MCP server matching (matched servers produce tools, unmatched produce warnings)
5. Makes tool calls through the governed pipeline and verifies audit logging
6. Verifies ACP session type metadata in audit entries
7. Verifies dropped server audit entries
8. Tests graceful shutdown

Uses the existing `e2e/fixtures/test-chapter/` workspace with the mcp-test agent and filesystem app.

## Scope

- New file: `e2e/tests/acp-proxy.test.ts`
- Reuses: existing e2e fixture infrastructure from `docker-init-full.test.ts`
- Reuses: ACP modules (matcher, rewriter, warnings, session, bridge)
- Reuses: proxy server, audit logging, db modules
