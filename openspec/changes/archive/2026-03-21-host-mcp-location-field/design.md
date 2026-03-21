# Design: Host MCP Server Schema — `location` Field

**Change:** #10 — Host MCP Server Schema — `location` Field
**PRD Ref:** REQ-010 (Host MCP Server Configuration)

---

## Overview

Add a `location` field to the app configuration schema and `ResolvedApp` type to distinguish between MCP servers that run inside the Docker proxy container ("proxy") and those that run on the host machine ("host").

## Design Decisions

### 1. Schema Design

Add to `appConfigSchema` in `role-types.ts`:
```typescript
location: z.enum(["proxy", "host"]).optional().default("proxy")
```

- **Optional with default:** Existing role definitions that omit `location` will seamlessly default to `"proxy"`, which is the current behavior. This makes the change fully backward-compatible.
- **Enum, not boolean:** Using `z.enum(["proxy", "host"])` instead of a boolean like `runOnHost` is more extensible (e.g., a future `"remote"` location) and more self-documenting.

### 2. Type Design

Add to `ResolvedApp` interface in `types.ts`:
```typescript
location: "proxy" | "host";
```

The field is **required** (not optional) on `ResolvedApp` because by the time an app is resolved, the default has been applied by Zod parsing or by the resolver. This ensures downstream consumers always have the field available without needing to check for undefined.

### 3. Propagation Points

Two code paths construct `ResolvedApp` objects:

1. **Role adapter** (`packages/shared/src/role/adapter.ts` `adaptApp()`): Reads from `AppConfig` (Zod-parsed, so `location` is always present after parsing) and maps to `ResolvedApp`.

2. **CLI resolver** (`packages/cli/src/resolver/resolve.ts` `resolveApp()`): Reads from `AppField` (the package.json field schema). `AppField` does not have `location` — it describes the package's own metadata, not the role's configuration. The resolver should default to `"proxy"` since packages resolved through the package graph are always proxy-side by default.

### 4. AppField Consideration

The `appFieldSchema` in `packages/shared/src/schemas/app.ts` describes the structure of an app **package** (what you publish as `@acme/app-github`). The `location` field is a **role-level** configuration — it describes where the role author wants the app to run. Therefore, `location` does NOT belong in `appFieldSchema`. It only belongs in `appConfigSchema` (the role's app configuration).

## Files Changed

| File | Change |
|------|--------|
| `packages/shared/src/schemas/role-types.ts` | Add `location` to `appConfigSchema` |
| `packages/shared/src/types.ts` | Add `location: "proxy" \| "host"` to `ResolvedApp` |
| `packages/shared/src/role/adapter.ts` | Map `app.location` in `adaptApp()` |
| `packages/cli/src/resolver/resolve.ts` | Default `location: "proxy"` in `resolveApp()` |
| 13+ test files | Add `location: "proxy"` to all `ResolvedApp` object literals |
| `packages/shared/tests/schemas/role-types.test.ts` (new) | Schema validation tests for `location` |

## Test Coverage

### New Tests (`packages/shared/tests/schemas/role-types.test.ts`)
- `appConfigSchema` accepts `location: "proxy"`
- `appConfigSchema` accepts `location: "host"`
- `appConfigSchema` defaults `location` to `"proxy"` when omitted
- `appConfigSchema` rejects `location: "invalid"`

### Existing Tests (updated)
- All `ResolvedApp` factory functions add `location: "proxy"` to their return values
- Role adapter test verifies `location` is propagated through `adaptApp()`
- Role adapter test verifies `location: "host"` is preserved for host apps

## Risks and Mitigations

- **Risk:** Many test files need updating (13+ files). **Mitigation:** The change to each file is mechanical — add `location: "proxy"` to existing object literals.
- **Risk:** Future consumers might forget to handle `location: "host"`. **Mitigation:** TypeScript's type system will enforce handling since the field is required on `ResolvedApp`.
