## 1. Add llmSchema to agent member schema

- [x] 1.1 Define `llmSchema` as `z.object({ provider: z.string(), model: z.string() })` in `src/schemas/member.ts`
- [x] 1.2 Add `llm: llmSchema.optional()` to `agentMemberSchema`

## 2. Add llm field to ResolvedMember interface

- [x] 2.1 Add `llm?: { provider: string; model: string }` to `ResolvedMember` in `src/resolver/types.ts`

## 3. Pass llm through in resolver

- [x] 3.1 Add `llm: chapter.llm` to the agent member return object in `resolveMember()` in `src/resolver/resolve.ts`

## 4. Add schema tests

- [x] 4.1 Test: agent member with valid `llm` field passes validation
- [x] 4.2 Test: agent member without `llm` passes validation (optional)
- [x] 4.3 Test: agent member with `llm: { provider: "openrouter" }` (missing model) fails
- [x] 4.4 Test: agent member with `llm: { model: "..." }` (missing provider) fails
- [x] 4.5 Test: human member with `llm` field -- field is stripped (consistent with runtimes behavior)

## 5. Add resolver tests

- [x] 5.1 Test: agent member with `llm` resolves with `llm` populated on ResolvedMember
- [x] 5.2 Test: agent member without `llm` resolves with `llm` undefined on ResolvedMember
- [x] 5.3 Test: human member resolves without `llm` field
- [x] 5.4 Test: existing repo-ops fixture has no llm (backward compatible)

## 6. Verify

- [x] 6.1 `npx tsc --noEmit` passes
- [x] 6.2 `npx eslint src/ tests/` passes
- [x] 6.3 `npx vitest run` passes -- 643 tests, 40 test files, 0 failures
