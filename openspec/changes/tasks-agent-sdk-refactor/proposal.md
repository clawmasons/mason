## Why

Tasks are currently modeled as executable units with their own dependency graphs (`requiredApps`, `requiredSkills`, `subTasks`), execution semantics (`taskType`, `timeout`, `approval`), and resolution logic. In practice, tasks are just prompts — "/" commands in agent frameworks backed by markdown files. The current `ResolvedTask` type carries 8 unused/vestigial properties from an earlier orchestration-focused design. Meanwhile, there's no standard way for agents to declare how they read/write task files (folder structure, naming conventions, frontmatter fields), forcing each agent's materializer to hardcode these details.

This change simplifies tasks to what they actually are (named prompts with metadata) and moves the agent-specific file layout concerns into a declarative `tasks` interface on `AgentPackage`.

## What Changes

- **BREAKING**: Remove `taskType`, `timeout`, `approval`, `requiredApps`, `requiredSkills`, `apps`, `skills`, `subTasks` from `ResolvedTask`
- **BREAKING**: Remove corresponding fields from `taskFieldSchema` (`taskType`, `timeout`, `approval`, `requires`, `tasks`)
- **BREAKING**: Remove `resolveTask()` dependency resolution logic (sub-task recursion, app/skill resolution for tasks)
- **BREAKING**: Remove task validation that recurses into `subTasks` and checks `requiredSkills`/`requiredApps`
- Add `displayName`, `description`, `category`, `tags: string[]`, `scope` to `ResolvedTask`
- Add `tasks` interface to `AgentPackage` defining how the agent reads/writes task markdown files
- Add generic `readTasks()` in agent-sdk that reads task markdown files from a source agent's folder, parses frontmatter + prompt based on the source `AgentTaskConfig`, and returns `ResolvedTask[]`
- Add generic `materializeTasks()` in agent-sdk that writes `ResolvedTask[]` to a target agent's folder format based on the target `AgentTaskConfig` — replaces per-agent hardcoded task file generation
- The full flow: `readTasks(sourceConfig, projectDir)` → `ResolvedTask[]` → `materializeTasks(tasks, targetConfig)` → `MaterializationResult`
- Remove `generateSlashCommand()` from claude-code-agent materializer and `generateCommandPrompt()` from pi-coding-agent materializer — replaced by the generic `materializeTasks()`
- Update `adaptTask()` in the role adapter to produce the simplified `ResolvedTask`

## Capabilities

### New Capabilities
- `agent-task-interface`: Declarative `tasks` config on `AgentPackage` that defines how an agent stores task files — `projectFolder`, `nameFormat`, `scopeFormat`, `supportedFields`, and `prompt` location. Enables reading tasks from one agent and writing them to another by abstracting the file layout.
- `task-read-write`: Generic `readTasks()` and `materializeTasks()` SDK helpers driven by `AgentTaskConfig`. `readTasks(config, projectDir)` discovers markdown files in the source agent's `projectFolder`, parses scope from file paths/names per `scopeFormat`, extracts frontmatter fields per `supportedFields`, reads prompt from `markdown-body`, and returns `ResolvedTask[]`. `materializeTasks(tasks, config)` does the inverse — produces `MaterializationResult` entries with correct paths, frontmatter, and prompt placement. Replaces per-agent hardcoded task generation.

### Modified Capabilities
- `agent-sdk`: `AgentPackage` interface gains the optional `tasks` field
- `package-schema-validation`: Task schema validation drastically simplified — remove `taskType`, `timeout`, `approval`, `requires`, `tasks` fields from `taskFieldSchema`
- `role-to-resolved-agent-adapter`: Task mapping simplified — `adaptTask()` no longer sets `taskType`, `apps`, `skills`, `subTasks`; produces new fields (`displayName`, `description`, `category`, `tags`, `scope`) from task metadata

## Impact

**Types & Schemas** (`packages/shared`):
- `ResolvedTask` in `types.ts` — remove 8 properties, add 5 new ones
- `taskFieldSchema` in `schemas/task.ts` — remove 5 fields
- `adaptTask()` in `role/adapter.ts` — simplified return shape

**CLI** (`packages/cli`):
- `resolveTask()` in `resolver/resolve.ts` — remove sub-task recursion, app/skill resolution
- `validate.ts` — remove `subTasks` recursion and `requiredSkills`/`requiredApps` checks
- `collectAppsFromTask()` helper — remove or simplify (no more sub-task recursion)

**Agent SDK** (`packages/agent-sdk`):
- `AgentPackage` interface in `types.ts` — add optional `tasks` field with `AgentTaskConfig` type
- `collectAllTasks()` helper — update to work with new `ResolvedTask` shape
- New `readTasks(config, projectDir)` helper — reads task files from an agent's folder, parses to `ResolvedTask[]`
- New `materializeTasks(tasks, config)` helper — writes `ResolvedTask[]` to agent-specific file layout
- New types: `AgentTaskConfig` (projectFolder, nameFormat, scopeFormat, supportedFields, prompt)

**Agent Packages** (`packages/claude-code-agent`, `packages/pi-coding-agent`):
- Default exports gain `tasks` config declaring their file layout conventions
- Remove `generateSlashCommand()` from claude-code-agent materializer — replaced by `materializeTasks()` call
- Remove `generateCommandPrompt()` from pi-coding-agent materializer — replaced by `materializeTasks()` call
- Materializer `materializeWorkspace()` methods simplified: collect tasks → call `materializeTasks(tasks, this.tasks)` → merge into result

**Tests** (6+ test files):
- All `ResolvedTask` test helpers need updating (remove old properties, add new ones)
- Validator tests for sub-task/skill checks removed
- Adapter test assertions updated

**Specs** (3 modified):
- `agent-sdk/spec.md` — add `tasks` field requirement
- `package-schema-validation/spec.md` — update task schema requirements
- `role-to-resolved-agent-adapter/spec.md` — update task mapping requirement
