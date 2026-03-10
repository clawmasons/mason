# Proposal: Audit Logging ACP Extensions

**Date:** 2026-03-10
**Change:** #10 from [ACP Proxy IMPLEMENTATION](../../../prds/acp-proxy/IMPLEMENTATION.md)
**PRD Refs:** REQ-008 (Audit Logging for ACP Sessions)

## Problem

The audit logging system currently has no concept of session type. All tool calls are logged identically whether they originate from a direct proxy session or an ACP session. Operators reviewing audit logs cannot distinguish ACP-originated calls from direct proxy calls, nor can they see which editor was used or which MCP servers were dropped during ACP session setup.

## Proposal

Extend the audit logging system to capture ACP session metadata:

1. Add `session_type` and `acp_client` columns to the `audit_log` table (nullable for backward compatibility)
2. Extend `HookContext` and `auditPostHook` to accept and pass through ACP metadata
3. Pass ACP metadata from the ACP session into the proxy container via environment variables
4. Create a `logDroppedServers()` function that writes dropped MCP server audit entries
5. Extend the `ChapterProxyServer` config to accept ACP session metadata

## Scope

- Modify: `packages/proxy/src/db.ts` -- add `session_type` and `acp_client` columns, add `dropped` status
- Modify: `packages/proxy/src/hooks/audit.ts` -- extend HookContext with ACP metadata
- Modify: `packages/proxy/src/server.ts` -- pass ACP metadata through to audit hooks
- Modify: `packages/cli/src/acp/session.ts` -- pass ACP metadata to proxy container via env vars
- New function: `logDroppedServers()` in `packages/proxy/src/hooks/audit.ts`
- Update: `packages/proxy/src/index.ts` -- export new types
- Update tests: audit hook and db tests verify ACP metadata flows through
