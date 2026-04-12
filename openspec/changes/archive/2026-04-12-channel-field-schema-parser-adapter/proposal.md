# Proposal: channel Field in Role Schema + Parser + Adapter

**Change:** CHANGE 1 from PRD `role-channels`
**Date:** 2026-04-12
**Status:** In Progress

## Problem

Mason roles have no mechanism for declaring a messaging channel (e.g., Slack) that the agent should connect to during a session. The role schema, parser, and adapter have no awareness of the `channel` concept, blocking all downstream channel integration work (materializer, Docker generator, MCP server packaging).

## Proposed Solution

1. Add `channelConfigSchema` and `channelFieldSchema` to `packages/shared/src/schemas/role-types.ts`
2. Add `channel` as an optional field on `roleSchema`
3. Update the parser (`packages/shared/src/role/parser.ts`) to extract `frontmatter.channel` and normalize string form (`"slack"`) to object form (`{ type: "slack", args: [] }`)
4. Export `ChannelConfig` type from `packages/shared/src/types/role.ts`
5. Add `channel` to `ResolvedRole` in `packages/shared/src/types.ts`
6. Map `role.channel` to `resolvedRole.channel` in `packages/shared/src/role/adapter.ts`
7. Preserve `channel` in role merge with scalar (current-wins) semantics in `packages/shared/src/role/merge.ts`
8. Add `channelConfig` to `MaterializeOptions` in `packages/agent-sdk/src/types.ts`

## Scope

- **Modify**: `packages/shared/src/schemas/role-types.ts` -- schema definitions
- **Modify**: `packages/shared/src/role/parser.ts` -- frontmatter extraction + normalization
- **Modify**: `packages/shared/src/types/role.ts` -- `ChannelConfig` type export
- **Modify**: `packages/shared/src/types.ts` -- `ResolvedRole.channel`
- **Modify**: `packages/shared/src/role/adapter.ts` -- `buildResolvedRole()` mapping
- **Modify**: `packages/shared/src/role/merge.ts` -- scalar merge semantics
- **Modify**: `packages/agent-sdk/src/types.ts` -- `MaterializeOptions.channelConfig`
- **Modify**: `packages/shared/src/index.ts` -- export `channelConfigSchema`, `channelFieldSchema`, `ChannelConfig`
- **Modify**: `packages/shared/src/schemas/index.ts` -- export new schemas
- **Add tests**: `packages/shared/tests/role-parser.test.ts` -- channel parsing tests
- **Add tests**: `packages/shared/tests/role-adapter.test.ts` -- channel adapter tests
- **Add tests**: `packages/shared/tests/schemas/role-types.test.ts` -- channel schema tests
- **Add tests**: `packages/shared/tests/role/merge.test.ts` -- channel merge tests

## Success Criteria

- `channel: slack` parsed to `{ type: "slack", args: [] }`
- `channel: { type: slack, args: ["--flag"] }` parsed to `{ type: "slack", args: ["--flag"] }`
- No `channel` field -- role parses successfully, `channel` is undefined
- Adapter: Role with channel produces ResolvedRole with matching channel
- Adapter: Role without channel produces ResolvedRole with no channel
- Merge: current role's channel wins over included role's channel
- All existing tests continue to pass (no regressions)
- TypeScript compiles cleanly
- Linter passes
