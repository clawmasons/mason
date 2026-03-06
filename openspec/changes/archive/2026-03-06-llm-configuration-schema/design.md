## Architecture

No new modules. This change adds one Zod sub-schema, one optional field to an existing schema, one field to a TypeScript interface, and one line of pass-through logic in the resolver.

### Schema Change (`src/schemas/member.ts`)

A new `llmSchema` is defined as a Zod object:

```typescript
const llmSchema = z.object({
  provider: z.string(),
  model: z.string(),
});
```

This is added to `agentMemberSchema` as an optional field:

```typescript
const agentMemberSchema = z.object({
  // ... existing fields ...
  llm: llmSchema.optional(),
});
```

The `humanMemberSchema` is NOT modified -- humans don't have LLM configuration. Since Zod strips unknown keys by default, if someone passes `llm` on a human member, it will be silently stripped (consistent with how `runtimes` behaves on human members today).

### Resolved Type Change (`src/resolver/types.ts`)

The `ResolvedMember` interface gains:

```typescript
export interface ResolvedMember {
  // ... existing fields ...
  llm?: {
    provider: string;
    model: string;
  };
}
```

This is optional because:
1. Human members never have it
2. Agent members using claude-code don't need it (Claude Code defaults to Anthropic)
3. Only agent members targeting pi-coding-agent (or future multi-provider runtimes) need it

### Resolver Logic Change (`src/resolver/resolve.ts`)

In `resolveMember()`, the agent member branch adds one field:

```typescript
if (chapter.memberType === "agent") {
  return {
    // ... existing fields ...
    llm: chapter.llm,  // NEW: pass through when present
  };
}
```

When `chapter.llm` is `undefined` (not provided), the field is omitted from the resolved member. When present, it's passed through as-is. No transformation needed -- the schema already validates the shape.

### Validation Note

This change does NOT add validation rules like "pi-coding-agent requires llm" or "claude-code warns when llm is present". Those are CHANGE 2 (LLM Validation Rules) in the implementation plan and are intentionally deferred to keep this change minimal and focused.

## Decisions

1. **`provider` and `model` are both free-form strings**: Per PRD Q5, we start with free-form strings rather than enums. This allows custom/self-hosted providers without schema changes. Validation of known providers happens at the materializer/validator layer (CHANGE 2), not the schema layer.

2. **Both fields required when `llm` is present**: If you specify `llm`, you must specify both `provider` and `model`. Partial configuration (provider without model, or model without provider) is rejected by the Zod schema.

3. **Human members silently strip `llm`**: Consistent with existing behavior where `runtimes` on human members is stripped. No error, no warning at the schema level.

4. **No default values**: The `llm` field has no default. When absent, it's `undefined`. The meaning of "no llm config" is runtime-dependent (claude-code uses Anthropic by default, pi-coding-agent errors).
