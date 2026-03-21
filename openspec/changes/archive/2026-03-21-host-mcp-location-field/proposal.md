# Proposal: Host MCP Server Schema — `location` Field

**PRD:** [host-proxy](../../../prds/host-proxy/PRD.md)
**Change:** #10 — Host MCP Server Schema — `location` Field
**PRD Ref:** REQ-010 (Host MCP Server Configuration)

---

## Problem

The current app config schema and `ResolvedApp` type have no way to distinguish where an MCP server should run. All MCP servers are implicitly assumed to run inside the Docker proxy container. To support host-side MCP servers (e.g., Xcode simulator tools that require macOS), we need a `location` field that lets role authors declare whether an MCP server runs on the proxy (Docker) or the host machine.

## Proposed Solution

Add a `location` field to two places:

1. **`appConfigSchema`** in `packages/shared/src/schemas/role-types.ts` — `z.enum(["proxy", "host"]).optional().default("proxy")`
2. **`ResolvedApp`** interface in `packages/shared/src/types.ts` — `location: "proxy" | "host"`

Propagate the field through:
- The role adapter (`packages/shared/src/role/adapter.ts` `adaptApp()`)
- The CLI resolver (`packages/cli/src/resolver/resolve.ts` `resolveApp()`)

This is a non-breaking change: existing roles without `location` default to `"proxy"`, preserving current behavior.

## Scope

- **Modify:** `packages/shared/src/schemas/role-types.ts` — add `location` to `appConfigSchema`
- **Modify:** `packages/shared/src/types.ts` — add `location` to `ResolvedApp`
- **Modify:** `packages/shared/src/role/adapter.ts` — propagate `location` in `adaptApp()`
- **Modify:** `packages/cli/src/resolver/resolve.ts` — propagate `location` in `resolveApp()`
- **Modify:** All test files constructing `ResolvedApp` objects — add `location` field
- **New:** `packages/shared/tests/schemas/role-types.test.ts` — validate location field

## Out of Scope

- Host MCP server lifecycle (Change 11)
- Host MCP server tool call routing (Change 12)
- CLI partitioning of apps by location
