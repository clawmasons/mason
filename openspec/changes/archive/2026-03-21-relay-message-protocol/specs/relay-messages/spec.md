# Relay Messages Spec

**Module:** `packages/proxy/src/relay/messages.ts`
**Test:** `packages/proxy/tests/relay/messages.test.ts`

## Overview

Defines the typed message protocol for the relay WebSocket. All relay communication between the Docker proxy and host proxy uses these message types.

## Exports

### Schemas (Zod)

| Schema | Type Discriminator | Direction |
|--------|-------------------|-----------|
| `CredentialRequestSchema` | `credential_request` | Docker -> Host |
| `CredentialResponseSchema` | `credential_response` | Host -> Docker |
| `ApprovalRequestSchema` | `approval_request` | Docker -> Host |
| `ApprovalResponseSchema` | `approval_response` | Host -> Docker |
| `McpToolCallSchema` | `mcp_tool_call` | Docker -> Host |
| `McpToolResultSchema` | `mcp_tool_result` | Host -> Docker |
| `McpToolsRegisterSchema` | `mcp_tools_register` | Host -> Docker |
| `McpToolsRegisteredSchema` | `mcp_tools_registered` | Docker -> Host |
| `AuditEventSchema` | `audit_event` | Docker -> Host |
| `RelayMessageSchema` | (discriminated union) | Any |

### Types (inferred from schemas)

- `CredentialRequestMessage`
- `CredentialResponseMessage`
- `ApprovalRequestMessage`
- `ApprovalResponseMessage`
- `McpToolCallMessage`
- `McpToolResultMessage`
- `McpToolsRegisterMessage`
- `McpToolsRegisteredMessage`
- `AuditEventMessage`
- `RelayMessage` (union of all)

### Functions

#### `parseRelayMessage(data: unknown): ParseResult`

Validates and type-narrows an unknown value against the relay message discriminated union.

- Returns `{ success: true, data: RelayMessage }` on valid input
- Returns `{ success: false, error: ZodError }` on invalid input
- Uses `RelayMessageSchema.safeParse()` internally

#### `createRelayMessage<T>(type: string, fields: Omit<T, 'id' | 'type'>): T`

Creates a relay message with a generated UUIDv4 `id` and the specified `type`.

- Uses `crypto.randomUUID()` for id generation
- Type-safe: caller specifies the message type and provides matching fields

## Message Schemas

### Base Shape

All messages share: `{ id: string (UUIDv4), type: string }`.

### credential_request

```typescript
{
  id: string;          // UUIDv4
  type: "credential_request";
  key: string;         // credential key to resolve
  agentId: string;     // requesting agent id
  role: string;        // agent's role
  sessionId: string;   // session identifier
  declaredCredentials: string[];  // credentials declared in role
}
```

### credential_response

```typescript
{
  id: string;          // matches request id
  type: "credential_response";
  key: string;         // credential key
  value?: string;      // resolved value (absent on error)
  source?: string;     // resolution source (env, keychain, .env)
  error?: string;      // error message
  code?: string;       // error code
}
```

### approval_request

```typescript
{
  id: string;
  type: "approval_request";
  agent_name: string;
  role_name: string;
  app_name: string;
  tool_name: string;
  arguments?: string;      // JSON-encoded
  ttl_seconds: number;     // timeout for approval
}
```

### approval_response

```typescript
{
  id: string;              // matches request id
  type: "approval_response";
  status: "approved" | "denied";
}
```

### mcp_tool_call

```typescript
{
  id: string;
  type: "mcp_tool_call";
  app_name: string;
  tool_name: string;       // original (unprefixed) name
  arguments?: Record<string, unknown>;
}
```

### mcp_tool_result

```typescript
{
  id: string;              // matches request id
  type: "mcp_tool_result";
  result?: Record<string, unknown>;  // MCP CallToolResult shape
  error?: string;
}
```

### mcp_tools_register

```typescript
{
  id: string;
  type: "mcp_tools_register";
  app_name: string;
  tools: Array<{
    name: string;
    description?: string;
    inputSchema: Record<string, unknown>;
  }>;
}
```

### mcp_tools_registered

```typescript
{
  id: string;              // matches register request id
  type: "mcp_tools_registered";
  app_name: string;
}
```

### audit_event

```typescript
{
  id: string;
  type: "audit_event";
  agent_name: string;
  role_name: string;
  app_name: string;
  tool_name: string;
  arguments?: string;
  result?: string;
  status: "success" | "error" | "denied" | "timeout" | "dropped";
  duration_ms?: number;
  timestamp: string;       // ISO 8601
}
```
