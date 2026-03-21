# Spec: Host MCP Server Schema — `location` Field

**Status:** Implemented
**Change:** #10 — Host MCP Server Schema — `location` Field
**PRD Ref:** REQ-010 (Host MCP Server Configuration)

---

## Specification

### 1. Schema Change — `appConfigSchema`

**File:** `packages/shared/src/schemas/role-types.ts`

Add to `appConfigSchema`:
```typescript
location: z.enum(["proxy", "host"]).optional().default("proxy"),
```

After this change, `AppConfig` (inferred from `appConfigSchema`) will always have `location: "proxy" | "host"` after Zod parsing.

### 2. Type Change — `ResolvedApp`

**File:** `packages/shared/src/types.ts`

Add to `ResolvedApp` interface:
```typescript
location: "proxy" | "host";
```

Required field. All code paths that produce `ResolvedApp` must set this field.

### 3. Adapter Propagation

**File:** `packages/shared/src/role/adapter.ts`

In `adaptApp()`, add:
```typescript
location: app.location,
```

Since `app` is typed as `AppConfig` (Zod-parsed), `app.location` is always `"proxy"` or `"host"`.

### 4. Resolver Propagation

**File:** `packages/cli/src/resolver/resolve.ts`

In `resolveApp()`, add:
```typescript
location: "proxy",
```

The resolver builds `ResolvedApp` from `AppField` (package metadata), which does not have `location`. Apps discovered through the package graph are always proxy-side.

### 5. Acceptance Criteria

1. `appConfigSchema.parse({ name: "test", location: "host" })` succeeds with `location: "host"`
2. `appConfigSchema.parse({ name: "test", location: "proxy" })` succeeds with `location: "proxy"`
3. `appConfigSchema.parse({ name: "test" })` succeeds with `location: "proxy"` (default)
4. `appConfigSchema.parse({ name: "test", location: "invalid" })` fails validation
5. `ResolvedApp` includes `location: "proxy" | "host"` (TypeScript compilation)
6. `adaptRoleToResolvedAgent` with a role containing `location: "host"` app produces `ResolvedApp` with `location: "host"`
7. All existing tests pass with `location: "proxy"` added to test fixtures
