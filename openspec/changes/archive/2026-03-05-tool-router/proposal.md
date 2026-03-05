## Why

The forge proxy aggregates upstream MCP servers behind a single endpoint, but the downstream runtime sees raw tool names from each upstream (e.g., `create_pr`, `send_message`). Without prefixing, generically-named tools from different apps collide and are indistinguishable. Without role-based filtering, the runtime sees tools the agent's roles don't permit.

The Tool Router sits between the `UpstreamManager` (CHANGE 2) and the downstream-facing MCP server (CHANGE 4). It builds a routing table that: (1) prefixes all tool names as `<appShortName>_<toolName>`, (2) filters out tools not in any role's allow-list, and (3) resolves incoming prefixed tool calls back to the correct upstream app and original tool name.

**PRD refs:** REQ-003 (Tool Name Prefixing), REQ-004 (Role-Based Tool Filtering)

## What Changes

- **New file: `src/proxy/router.ts`** — ToolRouter class that:
  - Takes upstream tools (per-app `Tool[]` map) and tool filters (per-app `ToolFilter` map)
  - Builds a routing table mapping prefixed names to `RouteEntry` objects
  - Exposes `listTools()` returning all prefixed, filtered MCP `Tool` objects
  - Exposes `resolve(prefixedName)` to look up the original app + tool name for forwarding
  - Uses `getAppShortName()` from `src/generator/toolfilter.ts` for name derivation

- **New file: `tests/proxy/router.test.ts`** — Unit tests for routing, filtering, and edge cases

## Capabilities

### New Capabilities
- `tool-router`: Builds a routing table that prefixes upstream tool names with their app short name, filters by role-based allow-lists, and resolves prefixed names back to upstream app + original tool name for forwarding

## Impact

- **New:** `src/proxy/router.ts` — tool routing and filtering
- **New:** `tests/proxy/router.test.ts` — router tests
- **No existing files modified**
- **No new dependencies**
