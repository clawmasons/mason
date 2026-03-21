## 1. Simplify ResolvedTask Type and Schema

- [x] 1.1 Remove `taskType`, `timeout`, `approval`, `requiredApps`, `requiredSkills`, `apps`, `skills`, `subTasks` from `ResolvedTask` interface in `packages/shared/src/types.ts`
- [x] 1.2 Add `displayName`, `description`, `category`, `tags`, `scope` to `ResolvedTask` interface
- [x] 1.3 Remove `taskType`, `timeout`, `approval`, `requires`, `tasks` from `taskFieldSchema` in `packages/shared/src/schemas/task.ts`; add optional `description` field
- [x] 1.4 Run `npx tsc --noEmit` to identify all compile errors from the type changes

## 2. Add AgentTaskConfig Type

- [x] 2.1 Define `AgentTaskConfig` interface in `packages/agent-sdk/src/types.ts` with `projectFolder`, `nameFormat`, `scopeFormat`, `supportedFields`, `prompt`
- [x] 2.2 Add optional `tasks?: AgentTaskConfig` field to `AgentPackage` interface
- [x] 2.3 Export `AgentTaskConfig` from `packages/agent-sdk/src/index.ts`

## 3. Implement readTasks()

- [x] 3.1 Create `readTasks(config, projectDir)` function in `packages/agent-sdk/src/helpers.ts`
- [x] 3.2 Implement file discovery: recursive walk for `scopeFormat: "path"`, flat listing for `"kebab-case-prefix"`
- [x] 3.3 Implement YAML frontmatter parsing and markdown body extraction
- [x] 3.4 Implement name derivation from filename (never from frontmatter)
- [x] 3.5 Implement scope extraction: path-to-colon for `"path"`, kebab-prefix-to-colon for `"kebab-case-prefix"` using known task name
- [x] 3.6 Implement `supportedFields` reverse mapping (frontmatter key → ResolvedTask property, including `->` syntax)
- [x] 3.7 Export `readTasks` from `packages/agent-sdk/src/index.ts`
- [x] 3.8 Write unit tests for `readTasks` in `packages/agent-sdk/tests/`

## 4. Implement materializeTasks()

- [x] 4.1 Create `materializeTasks(tasks, config)` function in `packages/agent-sdk/src/helpers.ts`
- [x] 4.2 Implement `nameFormat` token resolution (`{taskName}`, `{scopePath}`, `{scopeKebab}`) with empty-scope handling
- [x] 4.3 Implement YAML frontmatter generation from `supportedFields` (including `->` mapping and `"all"` mode)
- [x] 4.4 Implement markdown body generation from `task.prompt`
- [x] 4.5 Export `materializeTasks` from `packages/agent-sdk/src/index.ts`
- [x] 4.6 Write unit tests for `materializeTasks` in `packages/agent-sdk/tests/`
- [x] 4.7 Write round-trip test: `materializeTasks` → `readTasks` produces equivalent tasks

## 5. Update CLI Resolver and Validator

- [x] 5.1 Simplify `resolveTask()` in `packages/cli/src/resolver/resolve.ts`: remove app/skill/sub-task resolution loops, return simplified `ResolvedTask`
- [x] 5.2 Remove `subTasks` recursion from validator in `packages/cli/src/validator/validate.ts` (3 locations)
- [x] 5.3 Remove `requiredSkills`/`requiredApps` availability checks from validator
- [x] 5.4 Remove or simplify `collectAppsFromTask()` helper (no more sub-task recursion)
- [x] 5.5 Run `npx vitest run packages/cli/tests/` and fix failing tests

## 6. Update Role Adapter

- [x] 6.1 Simplify `adaptTask()` in `packages/shared/src/role/adapter.ts`: remove `taskType`, `apps`, `skills`, `subTasks`; add new fields
- [x] 6.2 Update adapter tests in `packages/shared/tests/role-adapter.test.ts`
- [x] 6.3 Run `npx vitest run packages/shared/tests/`

## 7. Update Agent SDK Helpers

- [x] 7.1 Remove `task.skills` iteration from `collectAllSkills()` in `packages/agent-sdk/src/helpers.ts`
- [x] 7.2 Update `collectAllTasks()` to work with simplified `ResolvedTask`
- [x] 7.3 Update agent-sdk helper tests in `packages/agent-sdk/tests/helpers.test.ts`
- [x] 7.4 Run `npx vitest run packages/agent-sdk/tests/`

## 8. Add Tasks Config to Agent Packages

- [x] 8.1 Add `tasks` config to claude-code-agent `AgentPackage` in `packages/claude-code-agent/src/index.ts`
- [x] 8.2 Add `tasks` config to pi-coding-agent `AgentPackage` in `packages/pi-coding-agent/src/index.ts`
- [x] 8.3 Remove `generateSlashCommand()` from `packages/claude-code-agent/src/materializer.ts`
- [x] 8.4 Replace task loop in claude-code-agent `materializeWorkspace()` with `materializeTasks()` call
- [x] 8.5 Remove `generateCommandPrompt()` from `packages/pi-coding-agent/src/materializer.ts`
- [x] 8.6 Update pi-coding-agent `generateExtensionIndexTs()` to read from materialized task files instead of building prompts from ResolvedTask + role context
- [x] 8.7 Update claude-code-agent materializer tests in `packages/claude-code-agent/tests/materializer.test.ts`
- [x] 8.8 Update pi-coding-agent materializer tests in `packages/pi-coding-agent/tests/materializer.test.ts`
- [x] 8.9 Update CLI materializer tests in `packages/cli/tests/materializer/`

## 9. Update Remaining Test Helpers

- [x] 9.1 Update `ResolvedTask` test helpers in `packages/cli/tests/validator/validate.test.ts`
- [x] 9.2 Update `ResolvedTask` test helpers in `packages/cli/tests/generator/agent-dockerfile.test.ts`
- [x] 9.3 Run full unit test suite across all changed packages

## Verify
- [x] 11.1 Run `npx tsc --noEmit` across all packages, fix all issues
- [x] 11.2 Run `npx eslint src/ tests/` across all packages fix all issues
- [x] 11.3 Run `nm run clean` and `npm run build` across all packages, fix all issues
- [x] 11.4 Run unit tests for all changed packages

## 10. Documentation

- [x] 10.1 Update `docs/task.md` to reflect simplified task model and AgentTaskConfig
- [x] 10.2 Update `docs/architecture.md` with new task read/write flow
- [x] 10.3 Create `docs/add-new-agent.md` guide covering AgentPackage interface including `tasks` config

## 11. Final Verification

- [x] 11.1 Run `npx tsc --noEmit` across all packages
- [x] 11.2 Run `npx eslint src/ tests/` across all packages
- [x] 11.3 Run `nm run clean` and `npm run build` across all packages, fix all issues
- [x] 11.4 Run unit tests for all changed packages
- [x] 11.5 Run e2e tests from `packages/tests`
