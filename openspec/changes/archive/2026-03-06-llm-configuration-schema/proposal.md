## Why

Agent members currently have no way to declare which LLM provider and model they should use. The `runtimes` field tells us *where* to run (claude-code, pi-coding-agent), but not *what model* to run with. This gap blocks the pi-coding-agent materializer (CHANGE 2+) because pi is provider-agnostic and requires explicit provider/model configuration -- it has no default.

Adding an `llm` field to the agent member schema is the foundational change that all subsequent pi-coding-agent work depends on. Without it, materializers cannot know which API key to inject, which model to configure, or how to validate the member's configuration.

## What Changes

- **Schema** (`src/schemas/member.ts`):
  - Add `llmSchema` -- a Zod object with required `provider: string` and `model: string`
  - Add `llm: llmSchema.optional()` to `agentMemberSchema`
  - Human members do not get the `llm` field (humans don't run on LLMs)

- **Resolver types** (`src/resolver/types.ts`):
  - Add `llm?: { provider: string; model: string }` to the `ResolvedMember` interface

- **Resolver logic** (`src/resolver/resolve.ts`):
  - In the agent member branch of `resolveMember()`, pass `chapter.llm` through to the resolved member when present

- **Tests**:
  - `tests/schemas/member.test.ts` -- schema accepts/rejects llm field correctly
  - `tests/resolver/resolve.test.ts` -- llm field passes through resolution

## Capabilities

### New Capabilities
- `llm-configuration-schema`: Agent members can declare LLM provider and model via an optional `llm` field

### Modified Capabilities
- `member-schema`: Agent member schema extended with optional `llm` field
- `member-resolver`: Resolver passes `llm` through to `ResolvedMember`

## Impact

- **Modified:** `src/schemas/member.ts` -- Add llmSchema and llm field to agentMemberSchema
- **Modified:** `src/resolver/types.ts` -- Add llm field to ResolvedMember interface
- **Modified:** `src/resolver/resolve.ts` -- Pass llm through in agent member resolution
- **Modified:** `tests/schemas/member.test.ts` -- Add llm schema validation tests
- **Modified:** `tests/resolver/resolve.test.ts` -- Add llm resolution tests
- **No new dependencies**
