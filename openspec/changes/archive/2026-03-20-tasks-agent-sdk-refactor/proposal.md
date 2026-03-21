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
- Update `adaptTask()` in the role adapter to produce a minimal `ResolvedTask` with `prompt: undefined` — the adapter only maps `TaskRef.name` to `ResolvedTask.name` with `version: "0.0.0"`. Prompt content is **not** set by the adapter.
- Add `resolveTaskContent()` in the CLI materializer layer (`role-materializer.ts`) that reads actual task file content from the source agent's folder using `readTasks()` and populates `prompt`, `displayName`, `description`, `category`, `tags`, and `scope` on the resolved tasks before materialization. This ensures materialized files contain the original task prompt content, not role instructions.
- Add `source.path` to packaged roles in `package-reader.ts` so `resolveTaskContent()` can locate task files in packages
- Agent materializers use `_agentPkg.tasks` from the parent `AgentPackage` instead of duplicating inline `AgentTaskConfig` objects

## Capabilities

### New Capabilities
- `agent-task-interface`: Declarative `tasks` config on `AgentPackage` that defines how an agent stores task files — `projectFolder`, `nameFormat`, `scopeFormat`, `supportedFields`, and `prompt` location. Enables reading tasks from one agent and writing them to another by abstracting the file layout.
- `task-read-write`: Generic `readTasks()` and `materializeTasks()` SDK helpers driven by `AgentTaskConfig`. `readTasks(config, projectDir)` discovers markdown files in the source agent's `projectFolder`, parses scope from file paths/names per `scopeFormat`, extracts frontmatter fields per `supportedFields`, reads prompt from `markdown-body`, and returns `ResolvedTask[]`. `materializeTasks(tasks, config)` does the inverse — produces `MaterializationResult` entries with correct paths, frontmatter, and prompt placement. Replaces per-agent hardcoded task generation.

### Modified Capabilities
- `agent-sdk`: `AgentPackage` interface gains the optional `tasks` field
- `package-schema-validation`: Task schema validation drastically simplified — remove `taskType`, `timeout`, `approval`, `requires`, `tasks` fields from `taskFieldSchema`
- `role-to-resolved-agent-adapter`: Task mapping simplified — `adaptTask()` produces a minimal `ResolvedTask` with only `name` and `version: "0.0.0"`. Prompt, displayName, description, category, tags, and scope are left undefined — they are populated later by `resolveTaskContent()` in the CLI materializer layer which reads actual task files from the source agent's folder.
- `task-content-resolution`: New capability in the CLI materializer layer — `resolveTaskContent()` bridges the gap between the stateless role adapter (which only knows `TaskRef.name`) and the materializer (which needs full task content). It determines the source agent's `AgentTaskConfig`, reads task files via `readTasks()`, and merges content back into the resolved tasks by name.

## Impact

**Types & Schemas** (`packages/shared`):
- `ResolvedTask` in `types.ts` — remove 8 properties, add 5 new ones
- `taskFieldSchema` in `schemas/task.ts` — remove 5 fields
- `adaptTask()` in `role/adapter.ts` — simplified return shape

**CLI** (`packages/cli`):
- `resolveTask()` in `resolver/resolve.ts` — remove sub-task recursion, app/skill resolution
- `validate.ts` — remove `subTasks` recursion and `requiredSkills`/`requiredApps` checks
- `collectAppsFromTask()` helper — remove or simplify (no more sub-task recursion)
- `role-materializer.ts` — add `resolveTaskContent()`, `getSourceTaskConfig()`, `getSourceProjectDir()`, and `MASON_TASK_CONFIG` constant; wire into `materializeForAgent()` after adapter call
- `docker-generator.ts` — call `resolveTaskContent()` in the supervisor materialization path

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
- Materializer `materializeWorkspace()` methods simplified: collect tasks → call `materializeTasks(tasks, _agentPkg.tasks)` → merge into result
- Both materializers use `_agentPkg.tasks` from the parent `AgentPackage` instead of inline duplicated `AgentTaskConfig` objects

**Shared** (`packages/shared`):
- `package-reader.ts` — add `path: packagePath` to source object for packaged roles so task files can be located

**Tests** (6+ test files):
- All `ResolvedTask` test helpers need updating (remove old properties, add new ones)
- Validator tests for sub-task/skill checks removed
- Adapter test assertions updated

**Specs** (5 total: 3 modified, 2 new):
- `agent-sdk/spec.md` — add `tasks` field requirement, readTasks/materializeTasks helpers
- `package-schema-validation/spec.md` — update task schema requirements
- `role-to-resolved-agent-adapter/spec.md` — update task mapping requirement (prompt is undefined, not from instructions)
- `agent-task-interface/spec.md` — new: AgentTaskConfig interface, field mapping, scope handling
- `task-read-write/spec.md` — new: readTasks/materializeTasks requirements, round-trip symmetry
