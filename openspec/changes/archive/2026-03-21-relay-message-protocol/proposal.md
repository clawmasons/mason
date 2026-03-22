## Why

The host-proxy PRD introduces a unified relay WebSocket replacing the single-purpose `/ws/credentials` channel. Before any relay server, client, or handler code can be written, the project needs a shared set of typed message definitions and validation schemas. Without these, every module that touches the relay would ad-hoc define its own message shapes, leading to inconsistencies and runtime parsing errors.

## What Changes

- New `packages/proxy/src/relay/messages.ts` — TypeScript interfaces and Zod schemas for all 9 relay message types (`credential_request`, `credential_response`, `approval_request`, `approval_response`, `mcp_tool_call`, `mcp_tool_result`, `mcp_tools_register`, `mcp_tools_registered`, `audit_event`), a `parseRelayMessage()` function using a Zod discriminated union, and a `createRelayMessage()` helper for generating messages with UUIDv4 ids.
- New `packages/proxy/tests/relay/messages.test.ts` — validation tests for each message type (valid and invalid inputs), unknown type handling, and missing field errors.

## Capabilities

### New Capabilities
- `relay-message-protocol`: Typed relay message definitions with Zod validation, `parseRelayMessage()` for incoming JSON parsing and type narrowing, `createRelayMessage()` for constructing outgoing messages.

### Modified Capabilities
_(none)_

## Impact

- **New file:** `packages/proxy/src/relay/messages.ts`
- **New test:** `packages/proxy/tests/relay/messages.test.ts`
- **Dependencies:** `zod` (add to proxy package.json — already used by `@clawmasons/shared`)
- **Depends on:** PRD section 5.3 (Relay Message Schemas)
- **No breaking changes** — purely additive, no modifications to existing code
