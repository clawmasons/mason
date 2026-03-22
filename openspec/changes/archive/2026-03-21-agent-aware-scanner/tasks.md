## Tasks

- [x] Move `AgentTaskConfig` interface from `packages/agent-sdk/src/types.ts` to `packages/shared/src/types.ts`
- [x] Update `packages/agent-sdk/src/types.ts` to re-export `AgentTaskConfig` from `@clawmasons/shared`
- [x] Add optional `taskConfig` and `skillConfig` fields to `DialectEntry` in `dialect-registry.ts`
- [x] Update built-in dialect registrations to include task/skill configs for claude-code-agent and mason
- [x] Add `ScanOptions` interface to `scanner.ts`
- [x] Update `scanProject()` signature to accept optional `ScanOptions` with dialect filtering
- [x] Refactor `scanCommands()` to use `DialectEntry.taskConfig` for directory resolution and scoping
- [x] Refactor `scanSkills()` to use `DialectEntry.skillConfig` for directory resolution
- [x] Export new types from `packages/shared/src/index.ts`
- [x] Add unit tests for dialect filtering in scanner
- [x] Add unit tests for agent-config-aware task scanning (path vs kebab-case scoping)
- [x] Add unit tests for fallback behavior when no config is registered
- [x] Verify all existing tests pass unchanged
- [x] Run TypeScript type-check (`npx tsc --noEmit`)
- [x] Run linter (`npx eslint src/ tests/`)
