# Schema Changes: `credentials` and `risk` Fields

**Status:** Implemented
**PRD:** [credential-service](../../prds/credential-service/PRD.md)
**PRD Refs:** REQ-013, REQ-014, REQ-015
**Branch:** `schema-credentials-risk`

---

## 1. Problem

Agents and apps have no way to declaratively specify which credentials (API keys, tokens) they require. Roles have no way to declare a risk level that controls credential access and proxy connection behavior. This blocks all downstream credential-service functionality.

## 2. Solution

Add three new schema fields to the existing Zod schemas in `packages/shared/src/schemas/`:

1. **`credentials`** on `agentChapterFieldSchema` — `z.array(z.string()).optional().default([])`
2. **`credentials`** on `appChapterFieldSchema` — `z.array(z.string()).optional().default([])`
3. **`risk`** on `roleChapterFieldSchema` — `z.enum(["HIGH", "MEDIUM", "LOW"]).optional().default("LOW")`

Update resolved types (`ResolvedAgent`, `ResolvedApp`, `ResolvedRole`) and the resolver to propagate these fields.

## 3. Design

### 3.1 Schema Changes

**Agent** (`packages/shared/src/schemas/agent.ts`):
```typescript
credentials: z.array(z.string()).optional().default([]),
```
Added to `agentChapterFieldSchema` object. Optional, defaults to empty array.

**App** (`packages/shared/src/schemas/app.ts`):
```typescript
credentials: z.array(z.string()).optional().default([]),
```
Added to `appChapterFieldSchema` object (before `.superRefine()`). Optional, defaults to empty array.

**Role** (`packages/shared/src/schemas/role.ts`):
```typescript
risk: z.enum(["HIGH", "MEDIUM", "LOW"]).optional().default("LOW"),
```
Added to `roleChapterFieldSchema` object. Optional, defaults to `"LOW"`.

### 3.2 Type Changes

**`packages/shared/src/types.ts`**:
- `ResolvedAgent`: add `credentials: string[]`
- `ResolvedApp`: add `credentials: string[]`
- `ResolvedRole`: add `risk: "HIGH" | "MEDIUM" | "LOW"`

### 3.3 Resolver Changes

**`packages/cli/src/resolver/resolve.ts`**:
- `resolveApp()`: propagate `chapter.credentials` to resolved output
- `resolveRole()`: propagate `chapter.risk` to resolved output
- `resolveAgent()`: propagate `chapter.credentials` to resolved output

## 4. Validation Rules

| Field | Valid | Invalid | Default |
|-------|-------|---------|---------|
| `credentials` (agent/app) | `["KEY_A", "KEY_B"]`, `[]` | `[123]`, `"string"`, `{ obj: true }` | `[]` |
| `risk` (role) | `"HIGH"`, `"MEDIUM"`, `"LOW"` | `"INVALID"`, `123`, `""` | `"LOW"` |

## 5. Test Plan

### New Tests
- Agent schema: validates `credentials` array of strings, rejects non-string array items, defaults to `[]`
- App schema: validates `credentials` array of strings, rejects non-string array items, defaults to `[]`
- Role schema: validates `risk` enum values, rejects invalid values, defaults to `"LOW"`
- Resolver: propagates `credentials` on agent and app, propagates `risk` on role

### Existing Tests
- Existing tests constructing `ResolvedAgent`, `ResolvedApp`, `ResolvedRole` via `Partial<>` helpers continue to work since new fields are optional with defaults.

## 6. Files Modified

| File | Change |
|------|--------|
| `packages/shared/src/schemas/agent.ts` | Add `credentials` field |
| `packages/shared/src/schemas/app.ts` | Add `credentials` field |
| `packages/shared/src/schemas/role.ts` | Add `risk` field |
| `packages/shared/src/types.ts` | Add `credentials` to `ResolvedAgent`, `ResolvedApp`; add `risk` to `ResolvedRole` |
| `packages/cli/src/resolver/resolve.ts` | Propagate new fields during resolution |
| `packages/cli/tests/schemas/app.test.ts` | Add credentials validation tests |
| `packages/cli/tests/schemas/role.test.ts` | Add risk validation tests |
| `packages/cli/tests/resolver/resolve.test.ts` | Add credentials/risk propagation tests |
