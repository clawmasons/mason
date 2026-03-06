# Proposal: Member Package Type — Schema & Resolver

## Problem

The codebase currently uses `type: "agent"` as the top-level deployable package type. The chapter-members PRD (REQ-005) requires replacing this with `type: "member"`, which supports two member types: `"human"` and `"agent"`. Human members have identity fields but no runtimes/proxy; agent members retain runtimes/proxy and gain identity fields. The existing `agentChapterFieldSchema`, `ResolvedAgent`, `resolveAgent()`, and `validateAgent()` all need to be updated to support the new member model with its discriminated union schema.

## Proposed Change

Replace the `agent` package type with `member` throughout the type system, schemas, resolver, validator, and all consuming code:

1. **Schema**: Replace `src/schemas/agent.ts` with `src/schemas/member.ts`. Define a Zod discriminated union on `memberType` (`"human"` | `"agent"`). Agent members require `runtimes` (min 1); human members must NOT have `runtimes` or `proxy`. Both require `name`, `slug`, `email`, `roles`. Optional: `authProviders`, `description`.

2. **Resolver**: Rename `ResolvedAgent` to `ResolvedMember` with new fields (`memberType`, `name`, `slug`, `email`, `authProviders`). Rename `resolveAgent()` to `resolveMember()`. The resolver handles both member types — human members resolve roles only (no runtimes/proxy).

3. **Validator**: Rename `validateAgent()` to `validateMember()`. The validator works for both member types since validation logic is role-based (not runtime-dependent).

4. **Consuming code**: Update all CLI commands, materializers, compose generators, proxy, toolfilter, and lock file generation to use the new types and function names.

5. **Component packages**: Update `chapter-core/members/note-taker/package.json` and `templates/note-taker/members/note-taker/package.json` to use the new member schema.

6. **Tests**: Update all test files to use the new types, function names, and schema shapes.

## Impact

- **Source files**: ~25 files in `src/` need updates
- **Test files**: ~15 test files need updates
- **Package JSON files**: 2 component package.json files need schema updates
- **Spec files**: ~8 openspec spec files need terminology updates
- **No new dependencies** required
- **Backward compatibility**: `type: "agent"` will no longer be accepted (clean break per PRD)

## PRD References

- REQ-005: Member Package Type
- PRD Section 4.1: Package Type: member
- PRD Section 8.4: Member Type Discrimination
