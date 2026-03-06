# Design: Member Package Type — Schema & Resolver

## Schema Design

### `src/schemas/member.ts`

Replace `agent.ts` with a discriminated union schema on `memberType`:

```typescript
const resourceSchema = z.object({
  type: z.string(),
  ref: z.string(),
  access: z.string(),
});

const proxySchema = z.object({
  port: z.number().int().positive().optional(),
  type: z.enum(["sse", "streamable-http"]).optional(),
});

const agentMemberSchema = z.object({
  type: z.literal("member"),
  memberType: z.literal("agent"),
  name: z.string(),
  slug: z.string(),
  email: z.string().email(),
  authProviders: z.array(z.string()).optional().default([]),
  description: z.string().optional(),
  runtimes: z.array(z.string()).min(1),
  roles: z.array(z.string()).min(1),
  resources: z.array(resourceSchema).optional().default([]),
  proxy: proxySchema.optional(),
});

const humanMemberSchema = z.object({
  type: z.literal("member"),
  memberType: z.literal("human"),
  name: z.string(),
  slug: z.string(),
  email: z.string().email(),
  authProviders: z.array(z.string()).optional().default([]),
  description: z.string().optional(),
  roles: z.array(z.string()).min(1),
});

export const memberChapterFieldSchema = z.discriminatedUnion("memberType", [
  agentMemberSchema,
  humanMemberSchema,
]);

export type MemberChapterField = z.infer<typeof memberChapterFieldSchema>;
```

### `src/schemas/chapter-field.ts` Changes

- Replace `agent` with `member` in the type union, schema map, and type values
- Import `memberChapterFieldSchema` / `MemberChapterField` instead of agent equivalents

### `src/schemas/index.ts` Changes

- Export `memberChapterFieldSchema` and `MemberChapterField` instead of agent equivalents

## Resolver Design

### `src/resolver/types.ts` — `ResolvedMember`

```typescript
export interface ResolvedMember {
  name: string;
  version: string;
  memberType: "human" | "agent";
  memberName: string;      // display name from schema
  slug: string;
  email: string;
  authProviders: string[];
  description?: string;
  runtimes: string[];       // empty array for human members
  roles: ResolvedRole[];
  resources?: Array<{ type: string; ref: string; access: string }>;
  proxy?: {
    port?: number;
    type?: "sse" | "streamable-http";
  };
}
```

Key decisions:
- `runtimes` is always present (empty `[]` for human members) to avoid optional chaining everywhere in consuming code
- `memberName` instead of `name` for the display name to avoid collision with `name` (the package name)
- `proxy` remains optional (undefined for human members)

### `src/resolver/resolve.ts` — `resolveMember()`

The function accepts both member types. For agent members, all fields are populated. For human members, `runtimes` is `[]`, `proxy` is `undefined`, and `resources` is `undefined`.

### `src/validator/validate.ts` — `validateMember()`

Rename only — the validation logic (requirement coverage, tool existence, skill availability, app launch config) operates on roles, which both member types have. No logic changes needed.

## Consuming Code Updates

All files that import `ResolvedAgent` / `resolveAgent` / `validateAgent` need mechanical renames:

| Old | New |
|-----|-----|
| `ResolvedAgent` | `ResolvedMember` |
| `resolveAgent` | `resolveMember` |
| `validateAgent` | `validateMember` |
| `AgentChapterField` | `MemberChapterField` |
| `agentChapterFieldSchema` | `memberChapterFieldSchema` |

Files affected:
- `src/compose/docker-compose.ts`
- `src/compose/env.ts`
- `src/compose/lock.ts`
- `src/generator/toolfilter.ts`
- `src/materializer/types.ts`
- `src/materializer/claude-code.ts`
- `src/cli/commands/install.ts`
- `src/cli/commands/build.ts`
- `src/cli/commands/validate.ts`
- `src/cli/commands/list.ts`
- `src/cli/commands/permissions.ts`
- `src/cli/commands/run.ts`
- `src/cli/commands/stop.ts`
- `src/cli/commands/docker-utils.ts`
- `src/cli/commands/proxy.ts`
- `src/resolver/index.ts`
- `src/validator/index.ts`
- `src/index.ts`

## Lock File Update

The `LockFile` type in `src/compose/types.ts` has an `agent` field that should be renamed to `member` with additional fields:

```typescript
export interface LockFile {
  lockVersion: number;
  member: {
    name: string;
    version: string;
    memberType: "human" | "agent";
    runtimes: string[];
  };
  roles: LockFileRole[];
  generatedFiles: string[];
}
```

## Component Package Updates

### `chapter-core/members/note-taker/package.json`

```json
{
  "chapter": {
    "type": "member",
    "memberType": "agent",
    "name": "Note Taker",
    "slug": "note-taker",
    "email": "note-taker@chapter.local",
    "description": "A note-taking agent that reads, writes, and organizes markdown files.",
    "runtimes": ["claude-code"],
    "roles": ["@clawmasons/role-writer"]
  }
}
```

### `templates/note-taker/members/note-taker/package.json`

Same structure with `{{projectScope}}` placeholders.

## Discovery Impact

In `src/resolver/discover.ts`, the `parseChapterField()` function dispatches on `type`. The discovery layer itself is type-agnostic — it just stores whatever `ChapterField` is parsed. No changes needed to discovery beyond what the schema update provides.

In `src/cli/commands/proxy.ts` and `list.ts`, the code filters packages by `chapterField.type === "agent"` — this needs to change to `"member"`.
