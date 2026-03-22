## Context

The host-proxy PRD (section 5.2-5.3) defines 9 relay message types organized by direction (Docker->Host, Host->Docker, acknowledgment). Each message shares a base shape: `{ id: string (UUIDv4), type: string (discriminator) }`. The relay server and client (future changes) will parse incoming JSON against these schemas and dispatch by type. This change provides the foundation — pure types and validation, no I/O.

The proxy package already depends on `@modelcontextprotocol/sdk` for MCP types like `CallToolResult`. The `zod` library is used throughout the shared package but is not yet a direct dependency of the proxy package.

## Goals / Non-Goals

**Goals:**
- Define TypeScript interfaces for all 9 message types matching PRD section 5.3
- Create Zod schemas that validate each message type independently
- Create a discriminated union schema for parsing any incoming relay message
- Provide `parseRelayMessage(data: unknown)` that returns a typed result or error
- Provide `createRelayMessage(type, fields)` helper that generates a UUIDv4 `id`
- Export all types and schemas from the module
- Comprehensive test coverage for valid inputs, invalid inputs, edge cases

**Non-Goals:**
- WebSocket transport or I/O (CHANGE 2-3)
- Message routing or dispatch (CHANGE 2-3)
- Serialization/deserialization of WebSocket frames (handled by relay server/client)

## Decisions

### D1: Zod discriminated union on `type` field

**Choice:** Use `z.discriminatedUnion("type", [...schemas])` for `parseRelayMessage()`.

**Rationale:** Zod's discriminated union provides O(1) dispatch by the `type` field and gives precise error messages (e.g., "Invalid discriminator value. Expected 'credential_request' | 'credential_response' | ..."). This matches the PRD's use of `type` as a string discriminator.

**Alternative considered:** Manual switch/case with individual `schema.parse()` calls — more code, worse error messages, no type narrowing benefit.

### D2: Return `{ success, data, error }` from `parseRelayMessage()` instead of throwing

**Choice:** Return a result object using Zod's `safeParse()`.

**Rationale:** The relay server/client will receive messages from untrusted WebSocket connections. Throwing on invalid messages would require try/catch at every call site. A result object lets callers handle errors with simple conditionals. This matches Zod's idiomatic `safeParse()` pattern.

### D3: `CallToolResult` as a loose record type in `McpToolResultMessage`

**Choice:** Define `result` as `z.record(z.unknown()).optional()` rather than importing and validating the full MCP `CallToolResult` Zod schema.

**Rationale:** The MCP SDK exports `CallToolResult` as a TypeScript type but its Zod schema (`CallToolResultSchema`) is a runtime validator tied to SDK internals. Coupling our relay schema to the SDK's internal Zod schema creates fragile version dependency. The relay message only needs to transport the result — the consuming side validates it against the MCP SDK types when processing. We use the TypeScript type for compile-time safety but keep the runtime schema loose.

### D4: UUIDv4 generation via `crypto.randomUUID()`

**Choice:** Use Node.js built-in `crypto.randomUUID()` for `createRelayMessage()`.

**Rationale:** Available since Node 19+, no external dependency needed. The proxy already targets ES2022+.

### D5: Add `zod` as direct dependency of proxy package

**Choice:** Add `zod` to `packages/proxy/package.json` dependencies.

**Rationale:** While `zod` is available transitively through `@clawmasons/shared`, direct dependencies are explicit and don't break if the shared package changes its deps. This matches the pattern used by `credential-service`.

## Module Structure

```
packages/proxy/src/relay/messages.ts
├── Base schema: RelayMessageBaseSchema { id: z.string().uuid(), type: z.string() }
├── Per-type schemas (9 total):
│   ├── CredentialRequestSchema
│   ├── CredentialResponseSchema
│   ├── ApprovalRequestSchema
│   ├── ApprovalResponseSchema
│   ├── McpToolCallSchema
│   ├── McpToolResultSchema
│   ├── McpToolsRegisterSchema
│   ├── McpToolsRegisteredSchema
│   └── AuditEventSchema
├── Discriminated union: RelayMessageSchema
├── Type exports (inferred from schemas)
├── parseRelayMessage(data: unknown) → { success, data?, error? }
└── createRelayMessage(type, fields) → RelayMessage with generated id
```

## Test Coverage

```
packages/proxy/tests/relay/messages.test.ts
├── parseRelayMessage()
│   ├── valid credential_request → typed CredentialRequestMessage
│   ├── valid credential_response → typed CredentialResponseMessage
│   ├── valid approval_request → typed ApprovalRequestMessage
│   ├── valid approval_response → typed ApprovalResponseMessage
│   ├── valid mcp_tool_call → typed McpToolCallMessage
│   ├── valid mcp_tool_result → typed McpToolResultMessage
│   ├── valid mcp_tools_register → typed McpToolsRegisterMessage
│   ├── valid mcp_tools_registered → typed McpToolsRegisteredMessage
│   ├── valid audit_event → typed AuditEventMessage
│   ├── unknown type → error
│   ├── empty object → error (missing id and type)
│   ├── missing required fields per type → error
│   ├── invalid id (not UUID) → error
│   └── extra fields → passes (Zod passthrough/strip behavior)
├── createRelayMessage()
│   ├── generates valid UUIDv4 id
│   ├── sets type correctly
│   └── includes provided fields
└── Individual schemas
    ├── each schema rejects wrong type discriminator
    └── each schema validates field types (e.g., ttl_seconds must be number)
```
