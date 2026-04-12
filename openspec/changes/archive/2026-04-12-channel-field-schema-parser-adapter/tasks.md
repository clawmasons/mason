# Tasks: channel Field in Role Schema + Parser + Adapter

**Change:** CHANGE 1 from PRD `role-channels`
**Date:** 2026-04-12

## Implementation Tasks

- [x] T1: Add `channelConfigSchema` and `channelFieldSchema` to `role-types.ts`
- [x] T2: Add `channel` to `roleSchema`
- [x] T3: Export `ChannelConfig` type from `types/role.ts`
- [x] T4: Export new schemas from barrel files (`schemas/index.ts`, `index.ts`)
- [x] T5: Normalize `channel` in parser (`parser.ts`)
- [x] T6: Add `channel` to `ResolvedRole` in `types.ts`
- [x] T7: Map `role.channel` to `resolvedRole.channel` in `adapter.ts`
- [x] T8: Add `channelConfig` to `MaterializeOptions` in `agent-sdk/src/types.ts`
- [x] T9: Add schema tests (`schemas/role-types.test.ts`)
- [x] T10: Add parser tests (`role-parser.test.ts`)
- [x] T11: Add adapter tests (`role-adapter.test.ts`)
- [x] T12: Add merge tests (`role/merge.test.ts`)
- [x] T13: Verify build, lint, and all tests pass
