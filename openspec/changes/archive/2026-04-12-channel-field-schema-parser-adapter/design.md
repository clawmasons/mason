# Design: channel Field in Role Schema + Parser + Adapter

**Change:** CHANGE 1 from PRD `role-channels`
**Date:** 2026-04-12

## Approach

Add the `channel` field end-to-end through the role pipeline: schema -> parser -> adapter -> resolved type. The change is additive -- no existing fields or behavior are modified.

## Detailed Changes

### 1. Schema (`packages/shared/src/schemas/role-types.ts`)

Add two new schemas before `roleSchema`:

```typescript
export const channelConfigSchema = z.object({
  type: z.string(),
  args: z.array(z.string()).optional().default([]),
});

export const channelFieldSchema = z.union([z.string(), channelConfigSchema]);
```

Add to `roleSchema`:
```typescript
channel: channelFieldSchema.optional(),
```

The `channelFieldSchema` union accepts both short form (`"slack"`) and long form (`{ type: "slack", args: ["--flag"] }`). The parser normalizes the string form before Zod validation, so the schema only sees the object form after normalization.

### 2. Types (`packages/shared/src/types/role.ts`)

Add inferred type export:
```typescript
export type ChannelConfig = z.infer<typeof channelConfigSchema>;
```

The `Role` type is already `z.infer<typeof roleSchema>`, so it automatically gains the `channel` field.

### 3. Parser (`packages/shared/src/role/parser.ts`)

In `readMaterializedRole()`, after extracting other fields from frontmatter, normalize the `channel` field:

```typescript
// Normalize channel field: string -> { type, args: [] }
let channel = frontmatter.channel;
if (typeof channel === "string") {
  channel = { type: channel, args: [] };
}
```

Include `channel` in the `roleData` object passed to `roleSchema.parse()`.

### 4. Adapter (`packages/shared/src/role/adapter.ts`)

In `buildResolvedRole()`, map `role.channel` to `resolvedRole.channel`:

```typescript
if (role.channel) {
  resolvedRole.channel = {
    type: role.channel.type,
    args: [...role.channel.args],
  };
}
```

### 5. ResolvedRole (`packages/shared/src/types.ts`)

Add `channel` field to `ResolvedRole` interface:
```typescript
channel?: { type: string; args: string[] };
```

### 6. Merge (`packages/shared/src/role/merge.ts`)

Channel uses scalar (current-wins) semantics. Since `mergeRoles` uses object spread (`...current`), the current role's `channel` already wins. No code change needed -- the spread handles it. But we should be explicit by keeping it out of the spread comment.

### 7. MaterializeOptions (`packages/agent-sdk/src/types.ts`)

Add to `MaterializeOptions`:
```typescript
channelConfig?: { type: string; args: string[] };
```

This prepares the materializer interface for CHANGE 4 (materializer injects channel config).

### 8. Barrel exports

- `packages/shared/src/schemas/index.ts`: export `channelConfigSchema`, `channelFieldSchema`
- `packages/shared/src/index.ts`: export `channelConfigSchema`, `channelFieldSchema`, `ChannelConfig`

## Test Coverage

### Schema tests (`packages/shared/tests/schemas/role-types.test.ts`)
- `channelConfigSchema` accepts `{ type: "slack" }` and defaults args to `[]`
- `channelConfigSchema` accepts `{ type: "slack", args: ["--flag"] }`
- `channelFieldSchema` accepts string `"slack"`
- `channelFieldSchema` accepts object `{ type: "slack", args: [] }`
- `roleSchema` accepts role with `channel` field
- `roleSchema` accepts role without `channel` field

### Parser tests (`packages/shared/tests/role-parser.test.ts`)
- `channel: slack` parsed to `{ type: "slack", args: [] }`
- `channel: { type: slack, args: ["--flag"] }` parsed to `{ type: "slack", args: ["--flag"] }`
- No `channel` field -- role parses, channel is undefined
- `channel: telegram` -- parsing succeeds (schema accepts any type string)

### Adapter tests (`packages/shared/tests/role-adapter.test.ts`)
- Role with channel -> ResolvedRole with matching channel
- Role without channel -> ResolvedRole with no channel

### Merge tests (`packages/shared/tests/role/merge.test.ts`)
- Current role's channel wins over included role's channel
- Current role without channel, included with channel -> included's channel propagates (via spread)

## Risks

- **Low**: Additive change. No existing behavior modified. TypeScript compiler and existing tests guard regressions.
