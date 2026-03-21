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

- [x] 6.1 Simplify `adaptTask()` in `packages/shared/src/role/adapter.ts`: remove `taskType`, `apps`, `skills`, `subTasks`; remove `instructions` param; leave `prompt: undefined`
- [x] 6.2 Update call site: `role.tasks.map((t) => adaptTask(t))` (drop second arg)
- [x] 6.3 Update adapter tests in `packages/shared/tests/role-adapter.test.ts` — change prompt assertion to `toBeUndefined()`
- [x] 6.4 Run `npx vitest run packages/shared/tests/`

## 7. Update Agent SDK Helpers

- [x] 7.1 Remove `task.skills` iteration from `collectAllSkills()` in `packages/agent-sdk/src/helpers.ts`
- [x] 7.2 Update `collectAllTasks()` to work with simplified `ResolvedTask`
- [x] 7.3 Update agent-sdk helper tests in `packages/agent-sdk/tests/helpers.test.ts`
- [x] 7.4 Run `npx vitest run packages/agent-sdk/tests/`

## 8. Add Tasks Config to Agent Packages

- [x] 8.1 Add `tasks` config to claude-code-agent `AgentPackage` in `packages/claude-code-agent/src/index.ts`
- [x] 8.2 Add `tasks` config to pi-coding-agent `AgentPackage` in `packages/pi-coding-agent/src/index.ts`
- [x] 8.3 Remove `generateSlashCommand()` from `packages/claude-code-agent/src/materializer.ts`
- [x] 8.4 Replace task loop in claude-code-agent `materializeWorkspace()` with `materializeTasks(_agentPkg.tasks)` call (no inline config duplication)
- [x] 8.5 Remove `generateCommandPrompt()` from `packages/pi-coding-agent/src/materializer.ts`
- [x] 8.6 Update pi-coding-agent `generateExtensionIndexTs()` to read from materialized task files instead of building prompts from ResolvedTask + role context
- [x] 8.7 Replace inline `AgentTaskConfig` in both materializers with `_agentPkg.tasks` from parent AgentPackage
- [x] 8.8 Update claude-code-agent materializer tests in `packages/claude-code-agent/tests/materializer.test.ts`
- [x] 8.9 Update pi-coding-agent materializer tests in `packages/pi-coding-agent/tests/materializer.test.ts`
- [x] 8.10 Update CLI materializer tests in `packages/cli/tests/materializer/`

## 9. Task Content Resolution

- [x] 9.1 Add `source.path` to packaged roles in `packages/shared/src/role/package-reader.ts`
- [x] 9.2 Update package-reader test assertion: `source.path` is now `toBeDefined()` instead of `toBeUndefined()`
- [x] 9.3 Add `MASON_TASK_CONFIG` constant in `packages/cli/src/materializer/role-materializer.ts`
- [x] 9.4 Add `getSourceTaskConfig(role)` helper — looks up source agent's `AgentTaskConfig` from dialect registry, falls back to MASON_TASK_CONFIG
- [x] 9.5 Add `getSourceProjectDir(role)` helper — derives project dir from `role.source.path` (3 levels up for local, direct for packages)
- [x] 9.6 Add `resolveTaskContent(agent, role)` — reads source task files via `readTasks()`, merges prompt/metadata by name into resolved tasks
- [x] 9.7 Wire `resolveTaskContent()` into `materializeForAgent()` after `adaptRoleToResolvedAgent()` and before materializer call
- [x] 9.8 Wire `resolveTaskContent()` into docker-generator supervisor path after `adaptRoleToResolvedAgent(role, agentType)`
- [x] 9.9 Export `resolveTaskContent` from role-materializer for docker-generator import

## 10. Update Remaining Test Helpers

- [x] 10.1 Update `ResolvedTask` test helpers in `packages/cli/tests/validator/validate.test.ts`
- [x] 10.2 Update `ResolvedTask` test helpers in `packages/cli/tests/generator/agent-dockerfile.test.ts`
- [x] 10.3 Run full unit test suite across all changed packages

## 11. Documentation

- [x] 11.1 Update `docs/task.md` to reflect simplified task model and AgentTaskConfig
- [x] 11.2 Update `docs/architecture.md` with new task read/write flow
- [x] 11.3 Create `docs/add-new-agent.md` guide covering AgentPackage interface including `tasks` config

## 12. Verification

- [x] 12.1 Run `npx tsc --noEmit` across all packages, fix all issues
- [x] 12.2 Run `npx eslint src/ tests/` across all packages, fix all issues
- [x] 12.3 Run `npm run clean` and `npm run build` across all packages, fix all issues
- [x] 12.4 Run unit tests for all changed packages (shared: 198, agent-sdk: 122, cli: 630, claude-code-agent: 48, pi-coding-agent: 39)
- [x] 12.5 Run e2e tests from `packages/tests` (1 passed)
