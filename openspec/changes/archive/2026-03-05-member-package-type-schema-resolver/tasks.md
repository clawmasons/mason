# Tasks: Member Package Type — Schema & Resolver

## Phase 1: Schema

- [ ] Create `src/schemas/member.ts` with discriminated union schema (replace `agent.ts`)
- [ ] Update `src/schemas/chapter-field.ts` — replace `agent` with `member` in union, map, type values
- [ ] Update `src/schemas/index.ts` — export `memberChapterFieldSchema` / `MemberChapterField`
- [ ] Delete `src/schemas/agent.ts`

## Phase 2: Resolver Types

- [ ] Update `src/resolver/types.ts` — rename `ResolvedAgent` to `ResolvedMember`, add `memberType`, `memberName`, `slug`, `email`, `authProviders`
- [ ] Update `src/resolver/resolve.ts` — rename `resolveAgent()` to `resolveMember()`, handle both member types
- [ ] Update `src/resolver/index.ts` — export `ResolvedMember` and `resolveMember`

## Phase 3: Validator

- [ ] Update `src/validator/validate.ts` — rename `validateAgent()` to `validateMember()`
- [ ] Update `src/validator/index.ts` — export `validateMember`

## Phase 4: Consuming Code

- [ ] Update `src/index.ts` — all re-exports
- [ ] Update `src/compose/docker-compose.ts` — `ResolvedAgent` to `ResolvedMember`
- [ ] Update `src/compose/env.ts` — `ResolvedAgent` to `ResolvedMember`
- [ ] Update `src/compose/lock.ts` — `ResolvedAgent` to `ResolvedMember`, lock file `agent` field to `member`
- [ ] Update `src/compose/types.ts` — `LockFile.agent` to `LockFile.member` with `memberType`
- [ ] Update `src/generator/toolfilter.ts` — `ResolvedAgent` to `ResolvedMember`
- [ ] Update `src/materializer/types.ts` — `ResolvedAgent` to `ResolvedMember`
- [ ] Update `src/materializer/claude-code.ts` — `ResolvedAgent` to `ResolvedMember`
- [ ] Update `src/cli/commands/install.ts` — all agent references to member
- [ ] Update `src/cli/commands/build.ts` — `resolveAgent`/`validateAgent` to member equivalents
- [ ] Update `src/cli/commands/validate.ts` — `resolveAgent`/`validateAgent` to member equivalents
- [ ] Update `src/cli/commands/list.ts` — `resolveAgent`/`ResolvedAgent` + `type === "agent"` filter
- [ ] Update `src/cli/commands/permissions.ts` — `resolveAgent` to `resolveMember`
- [ ] Update `src/cli/commands/proxy.ts` — `resolveAgent`/`ResolvedAgent` + `type === "agent"` filter
- [ ] Update `src/cli/commands/run.ts` — `resolveAgentDir` to `resolveMemberDir`
- [ ] Update `src/cli/commands/stop.ts` — `resolveAgentDir` to `resolveMemberDir`
- [ ] Update `src/cli/commands/docker-utils.ts` — `resolveAgentDir` to `resolveMemberDir`

## Phase 5: Component Packages

- [ ] Update `chapter-core/members/note-taker/package.json` — new member schema fields
- [ ] Update `templates/note-taker/members/note-taker/package.json` — new member schema fields

## Phase 6: Tests

- [ ] Rename/rewrite `tests/schemas/agent.test.ts` to `tests/schemas/member.test.ts`
- [ ] Update `tests/schemas/chapter-field.test.ts` — agent test case to member
- [ ] Update `tests/resolver/resolve.test.ts` — all `resolveAgent` to `resolveMember`, fixture types
- [ ] Update `tests/validator/validate.test.ts` — all `validateAgent` to `validateMember`, fixture types
- [ ] Update `tests/compose/docker-compose.test.ts` — `ResolvedAgent` fixtures
- [ ] Update `tests/compose/env.test.ts` — `ResolvedAgent` fixtures
- [ ] Update `tests/compose/lock.test.ts` — `ResolvedAgent` fixtures + lock file field
- [ ] Update `tests/generator/toolfilter.test.ts` — `ResolvedAgent` fixtures
- [ ] Update `tests/materializer/claude-code.test.ts` — `ResolvedAgent` fixtures
- [ ] Update `tests/cli/docker-utils.test.ts` — `resolveAgentDir` to `resolveMemberDir`
- [ ] Update `tests/cli/proxy.test.ts` — `resolveAgent` mocks + `ResolvedAgent` fixtures

## Phase 7: Verify

- [ ] `npx tsc --noEmit` compiles
- [ ] `npx vitest run` — all tests pass
- [ ] `npx eslint src/ tests/` — no errors
- [ ] Grep for `ResolvedAgent`, `resolveAgent`, `validateAgent`, `AgentChapterField`, `agentChapterFieldSchema` in src/ and tests/ returns zero results
- [ ] Grep for `type: "agent"` in package.json files (excluding archives) returns zero results
