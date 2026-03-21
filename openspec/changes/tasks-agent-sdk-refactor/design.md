## Context

Tasks are currently modeled as executable units with dependency graphs (apps, skills, sub-tasks) and execution semantics (taskType, timeout, approval). Each agent materializer has its own hardcoded task file generation:

- **Claude Code**: `generateSlashCommand()` writes `.claude/commands/{name}.md` with role context, skill references, and prompt reference
- **Pi Coding**: `generateCommandPrompt()` embeds prompt content into `pi.registerCommand()` calls in an extension index.ts

In practice, tasks are just named prompts — "/" commands backed by markdown. The current `ResolvedTask` carries 8 vestigial properties. There is no standard way for agents to declare their task file layout, making cross-agent task portability impossible.

### Current flow
```
TaskField (package.json) → resolveTask() [resolves apps, skills, sub-tasks]
  → ResolvedTask → per-materializer generation → agent-specific files
```

### Target flow
```
adaptRoleToResolvedAgent(role) → ResolvedAgent with tasks having prompt: undefined
  → resolveTaskContent(agent, role) → reads actual task files from source, populates prompt/metadata
  → materializeTasks(tasks, targetConfig) → markdown files in target agent's folder
```

The key insight: the **role adapter** (`packages/shared`) is stateless and cannot read files — it only maps `TaskRef.name` to `ResolvedTask.name`. The **CLI materializer layer** handles reading actual task content from disk via `resolveTaskContent()`, which uses `readTasks()` from `agent-sdk` to read source task files and merge content back into the resolved tasks.

## Goals / Non-Goals

**Goals:**
- Simplify `ResolvedTask` to: name, displayName, description, category, tags, scope, version, prompt
- Define `AgentTaskConfig` on `AgentPackage` so agents declaratively describe their task file layout
- Provide generic `readTasks()` and `materializeTasks()` in agent-sdk — config-driven read/write replacing per-agent hardcoded logic
- Enable the full flow: read tasks from source agent → resolve to `ResolvedTask[]` → write to target agent
- Ensure materialized task files preserve original prompt content — the adapter leaves prompt undefined, and `resolveTaskContent()` in the CLI materializer reads actual source files
- Agent materializers reference `_agentPkg.tasks` from parent AgentPackage — no duplicated inline configs
- Packaged roles include `source.path` so task files can be located for content resolution
- Update docs/task.md, docs/architecture.md
- Add doc "docs/add-new-agent.md" — guide on how to implement another agent for the agent SDK

**Non-Goals:**
- Task execution/orchestration (taskType, timeout, approval are removed, not replaced)
- Runtime task discovery — each agent framework already knows how to find its own files
- Changing how role context / system prompts are materialized (that's a separate concern)

## Decisions

### 1. AgentTaskConfig type

```typescript
interface AgentTaskConfig {
  /** Folder where task files live, relative to workspace root */
  projectFolder: string;
  /** File name template. Tokens: {scopePath}, {scopeKebab}, {taskName} */
  nameFormat: string;
  /** How scope is encoded in the file system */
  scopeFormat: "path" | "kebab-case-prefix";
  /** Which ResolvedTask fields map to frontmatter. "all" or array of field names/mappings */
  supportedFields: "all" | Array<string | `${string}->${string}`>;
  /** Where the prompt content goes */
  prompt: "markdown-body";
}
```

**Rationale:** Declarative over imperative. The config fully describes the file layout without any agent-specific code. Tokens in `nameFormat` are resolved by `materializeTasks()`.

**Alternatives considered:**
- Having each agent implement a `writeTask()` method — rejected because it defeats the purpose of a generic helper and keeps per-agent logic
- Using a plugin system — over-engineered for what is fundamentally string formatting

### 2. readTasks() — config-driven task reader

```typescript
function readTasks(
  config: AgentTaskConfig,
  projectDir: string,
): ResolvedTask[]
```

The function:
1. Discovers markdown files in `path.join(projectDir, config.projectFolder)`
   - When `scopeFormat: "path"` — walks subdirectories recursively
   - When `scopeFormat: "kebab-case-prefix"` — lists `.md` files in the flat folder
2. For each file, parses YAML frontmatter and markdown body
3. **`name` is always derived from the filename** (with scope prefix and `.md` extension removed):
   - `"path"`: `ops/triage/fix-bug.md` → name `"fix-bug"`
   - `"kebab-case-prefix"`: `ops-triage-fix-bug.md` → name `"fix-bug"` (after scope prefix removal)
4. If frontmatter contains a `name` (or mapped field like `displayName`), it is read as `displayName` — never overrides the filename-derived `name`
5. Extracts `scope` from the file path/name:
   - `"path"`: directory structure relative to `projectFolder` → colon-delimited scope (e.g., `ops/triage/fix-bug.md` → scope `"ops:triage"`)
   - `"kebab-case-prefix"`: filename prefix before task name → colon-delimited scope (e.g., `ops-triage-fix-bug.md` → scope `"ops:triage"`)
6. Maps remaining frontmatter fields through `supportedFields` reverse mapping
7. Reads prompt from markdown body (when `prompt: "markdown-body"`)
8. Returns `ResolvedTask[]` with all available fields populated
9. Tasks with no scope (files directly in `projectFolder` root, or no kebab prefix) get `scope: ""`

**Scope extraction for `kebab-case-prefix`:** We always resolve tasks by a known name (from `Role.tasks`), so there is no ambiguity. When looking for task `"fix-bug"`, find the file ending with `fix-bug.md` in `projectFolder`. Everything before the task name in the filename is the scope prefix: `ops-triage-fix-bug.md` → scope `"ops:triage"` (strip trailing `-`, split remaining on `-`, join with `:`). For `"path"` scope format, the task name is the filename and the directory path relative to `projectFolder` is the scope.

**Rationale:** `name` from filename is the single source of truth — it's what the agent framework uses to reference the task. `displayName` is cosmetic metadata. Reading is the inverse of writing, driven by the same `AgentTaskConfig`.

**Alternatives considered:**
- Separate `AgentTaskReadConfig` / `AgentTaskWriteConfig` — rejected because the config is inherently bidirectional
- Reading via glob patterns instead of config-driven discovery — rejected because the config already has all the info needed

### 3. materializeTasks() — config-driven task writer

```typescript
function materializeTasks(
  tasks: ResolvedTask[],
  config: AgentTaskConfig,
): MaterializationResult
```

The function:
1. Iterates tasks
2. Resolves the file path from `nameFormat` + `scopeFormat`
3. Builds YAML frontmatter from `supportedFields` (mapping field names as needed)
4. Places prompt content as the markdown body
5. Returns `Map<string, string>` of relative paths → file content

**Role context and skill references are NOT included in task files.** Currently, `generateSlashCommand()` injects role permissions and skill paths into each task file. This couples tasks to their execution context. In the new model, tasks are portable prompts — role context belongs in the agent's system prompt (already handled by `--append-system-prompt` / materializer-generated config).

**Rationale:** Clean separation. Tasks describe *what* to do; role context describes *constraints* during execution. Mixing them prevents task portability.

**Alternatives considered:**
- Keeping role context injection as an optional feature — rejected because it complicates the generic helper and the current role context is already available via system prompt materialization

### 4. Scope handling

Scope is a colon-delimited string (e.g., `"ops:triage"`, `""` for root).

| scopeFormat | Scope `"ops:triage"` | Scope `""` (no scope) |
|---|---|---|
| `path` | `.claude/commands/ops/triage/fix-bug.md` | `.claude/commands/fix-bug.md` |
| `kebab-case-prefix` | `.mason/tasks/ops-triage-fix-bug.md` | `.mason/tasks/fix-bug.md` |

**No-scope tasks are placed directly in `projectFolder`** — no default subdirectory, no prefix. When `scopeFormat: "path"` and scope is empty, the `{scopePath}/` token resolves to `""` producing `projectFolder/taskName.md`. When `scopeFormat: "kebab-case-prefix"` and scope is empty, the `{scopeKebab}-` token resolves to `""` producing `projectFolder/taskName.md`.

When reading:
- `"path"`: files directly in `projectFolder` (not in a subdirectory) have `scope: ""`; files in subdirectories derive scope from the path
- `"kebab-case-prefix"`: files with no prefix (just `taskName.md`) have `scope: ""`

**Rationale:** Maps directly to how Claude Code (subdirectories) and Pi/Mason (flat folder) organize files. Root-level tasks are the common case and shouldn't require a synthetic scope.

### 5. supportedFields and field mapping

`supportedFields` controls which `ResolvedTask` properties become YAML frontmatter:

- `"all"` — write all properties except `name`, `prompt`, and `scope` (name/scope are in the filename, prompt is in the body)
- `["description", "category", "tags"]` — only these fields
- `["displayName", "description"]` — write `displayName` as a frontmatter field

**`name` is never written to frontmatter** — it is always the filename. `displayName` is an independent field that agents can optionally store in frontmatter for human-friendly display. During read, if an agent's frontmatter has a field called `name` (e.g., Claude Code commands), it is mapped to `displayName` on the `ResolvedTask` — the filename-derived name is always authoritative.

The `->` mapping syntax handles this: `"name->displayName"` means "the frontmatter key is `name`, but map it to/from `displayName` on `ResolvedTask`."

Example output for Claude Code config (`supportedFields: ["name->displayName", "description", "category", "tags"]`):
```yaml
---
name: Fix Bug
description: Triage and fix a reported bug
category: ops
tags:
  - triage
  - bugs
---
<prompt content here>
```
Here `name: Fix Bug` in frontmatter is the display name. The task's actual `name` is `"fix-bug"` (derived from the filename `fix-bug.md`).

Fields not in `supportedFields` are silently dropped during write. During read, only fields present in frontmatter are populated.

### 6. Concrete agent configs

**Claude Code:**
```typescript
tasks: {
  projectFolder: ".claude/commands",
  nameFormat: "{scopePath}/{taskName}.md",
  scopeFormat: "path",
  supportedFields: ["name->displayName", "description", "category", "tags"],
  prompt: "markdown-body",
}
```

**Pi Coding:**
```typescript
tasks: {
  projectFolder: ".pi/prompts",
  nameFormat: "{scopeKebab}-{taskName}.md",
  scopeFormat: "kebab-case-prefix",
  supportedFields: ["description"],
  prompt: "markdown-body",
}
```

**Mason (internal):**
```typescript
tasks: {
  projectFolder: ".mason/tasks",
  nameFormat: "{scopeKebab}-{taskName}.md",
  scopeFormat: "kebab-case-prefix",
  supportedFields: "all",
  prompt: "markdown-body",
}
```

### 7. Task content resolution — resolveTaskContent()

The role adapter in `packages/shared` is stateless: it maps `TaskRef` (which is just `{ name, ref? }`) to `ResolvedTask` with `name` and `version: "0.0.0"`. It does **not** set `prompt` because `TaskRef` has no content — the actual task markdown lives on disk.

The CLI materializer layer bridges this gap with `resolveTaskContent(agent, role)`:

```typescript
// packages/cli/src/materializer/role-materializer.ts

const MASON_TASK_CONFIG: AgentTaskConfig = {
  projectFolder: ".mason/tasks",
  nameFormat: "{scopeKebab}-{taskName}.md",
  scopeFormat: "kebab-case-prefix",
  supportedFields: "all",
  prompt: "markdown-body",
};

function getSourceTaskConfig(role: Role): AgentTaskConfig | undefined {
  const dialect = role.source.agentDialect;
  if (!dialect || dialect === "mason") return MASON_TASK_CONFIG;
  const agentPkg = getAgentFromRegistry(dialect);
  return agentPkg?.tasks ?? MASON_TASK_CONFIG;
}

function getSourceProjectDir(role: Role): string | undefined {
  if (role.source.type === "package" && role.source.path) return role.source.path;
  if (role.source.type === "local" && role.source.path) return path.resolve(role.source.path, "..", "..", "..");
  return undefined;
}

export function resolveTaskContent(agent: ResolvedAgent, role: Role): void {
  const sourceConfig = getSourceTaskConfig(role);
  const sourceProjectDir = getSourceProjectDir(role);
  if (!sourceConfig || !sourceProjectDir) return;
  const sourceTasks = readTasks(sourceConfig, sourceProjectDir);
  const sourceByName = new Map(sourceTasks.map((t) => [t.name, t]));
  for (const resolvedRole of agent.roles) {
    for (const task of resolvedRole.tasks) {
      const source = sourceByName.get(task.name);
      if (source) {
        task.prompt = source.prompt;
        if (source.displayName) task.displayName = source.displayName;
        if (source.description) task.description = source.description;
        if (source.category) task.category = source.category;
        if (source.tags) task.tags = source.tags;
        if (source.scope) task.scope = source.scope;
      }
    }
  }
}
```

This is called in two places:
1. `materializeForAgent()` in `role-materializer.ts` — after `adaptRoleToResolvedAgent()` and before the materializer call
2. The supervisor path in `docker-generator.ts` — after `adaptRoleToResolvedAgent(role, agentType)`

**Rationale:** The adapter layer (`packages/shared`) cannot import from `agent-sdk` and should remain stateless — it doesn't know about file systems or agent registries. The CLI materializer is the right place because it already has access to the agent registry, file system, and the full `Role` object with source information. This keeps the clean separation: adapter maps structure, materializer resolves content.

**Alternatives considered:**
- Setting prompt in the adapter from `role.instructions` — this was the original bug; role instructions are not task content
- Having the adapter accept a content-resolution callback — over-complicated for what is a CLI-layer concern
- Reading task content in each agent's materializer — would duplicate the resolution logic across agents

### 8. Agent materializers use _agentPkg.tasks

Both `claude-code-agent` and `pi-coding-agent` materializers previously had inline `AgentTaskConfig` objects duplicating the values from their `AgentPackage.tasks` definitions. These are replaced with `_agentPkg.tasks` (set via `_setAgentPackage()`), eliminating duplication:

```typescript
// Before: inline taskConfig duplicating AgentPackage.tasks values
const taskConfig: AgentTaskConfig = { projectFolder: ".claude/commands", ... };
const taskFiles = materializeTasks(allTasks.map(([t]) => t), taskConfig);

// After: use the canonical config from AgentPackage
if (_agentPkg.tasks) {
  const allTasks = collectAllTasks(agent.roles);
  const taskFiles = materializeTasks(allTasks.map(([t]) => t), _agentPkg.tasks);
  for (const [p, c] of taskFiles) result.set(p, c);
}
```

### 9. Packaged roles include source.path

`package-reader.ts` now includes `path: packagePath` in the source object for packaged roles:

```typescript
source: {
  type: "package" as const,
  packageName: pkgJson.name,
  path: packagePath,  // NEW: enables resolveTaskContent to find task files
},
```

This allows `resolveTaskContent()` to locate task files in both local roles (deriving project dir from `.mason/roles/<name>/` path) and packaged roles (using the package directory directly).

### 10. Removal strategy for ResolvedTask properties

**Remove from `ResolvedTask` interface** (types.ts):
- `taskType`, `timeout`, `approval` — execution semantics, no longer modeled
- `requiredApps`, `requiredSkills` — dependency graph, no longer modeled
- `apps: ResolvedApp[]`, `skills: ResolvedSkill[]` — resolved dependencies
- `subTasks: ResolvedTask[]` — composite task tree

**Remove from `taskFieldSchema`** (schemas/task.ts):
- `taskType`, `timeout`, `approval`, `requires`, `tasks` — all execution/dependency fields

**Remove from `resolveTask()`** (resolve.ts):
- App resolution loop (lines 119-124)
- Skill resolution loop (lines 127-132)
- Sub-task resolution loop with circular dep detection (lines 134-141)
- Simplify return to: `{ name, version, prompt, description, scope, ... }`

**Remove from validator** (validate.ts):
- `subTasks` recursion (3 locations)
- `requiredSkills`/`requiredApps` availability checks
- `collectAppsFromTask()` sub-task recursion

**Remove from agent materializers:**
- `generateSlashCommand()` in claude-code-agent/src/materializer.ts
- `generateCommandPrompt()` in pi-coding-agent/src/materializer.ts
- The task loop in each materializer's `materializeWorkspace()` — replaced by `materializeTasks()` call

**Update `collectAllSkills()`** (helpers.ts):
- Remove the inner loop that collects skills from `task.skills` (lines 62-67) — tasks no longer have skills

### 11. Pi Coding Agent materializer impact

**Research finding:** Pi does **not** natively discover prompts from a folder. It loads commands via extensions — the materializer generates `.pi/extensions/mason-mcp/index.ts` which calls `pi.registerCommand({ name, description, prompt })` for each task. There is no `.pi/prompts/` convention in the pi runtime.

This means pi-coding-agent cannot use `materializeTasks()` to write standalone markdown files — pi wouldn't find them. Instead:

- **Pi's `AgentTaskConfig`** declares `projectFolder: ".pi/prompts"` as the **canonical storage location** for reading/writing task markdown (used by mason for cross-agent portability)
- **Pi's materializer** additionally generates the extension `index.ts` that registers commands — this is pi-specific materialization on top of the generic task files
- The pi materializer calls `materializeTasks()` to generate the markdown files, then also generates the extension that `pi.registerCommand()`s each task by reading from those files (or inlining the prompt)
- `generateExtensionIndexTs()` is updated to iterate the task markdown files rather than building prompts from `ResolvedTask` + role context

This keeps the generic read/write path clean while acknowledging pi's runtime requires the extension bridge.

### 12. nameFormat token resolution

The `nameFormat` string is resolved by replacing tokens:
- `{taskName}` → task.name (kebab-case, e.g., `"fix-bug"`)
- `{scopePath}` → scope as path (e.g., `"ops/triage"`) — only valid when `scopeFormat: "path"`
- `{scopeKebab}` → scope as kebab prefix (e.g., `"ops-triage"`) — only valid when `scopeFormat: "kebab-case-prefix"`

When scope is empty, `{scopePath}` resolves to `""` (file at root of projectFolder) and `{scopeKebab}` resolves to `""` (no prefix).

## Risks / Trade-offs

**[Role context no longer in task files]** → Tasks become simpler but lose inline execution context. Mitigated by: role context already materialized in system prompt via `--append-system-prompt`. Agents that need per-task role context can add it through their own mechanisms.

**[Pi extension index.ts changes]** → The `pi.registerCommand()` approach may still be needed if pi doesn't natively discover prompts. Mitigated by: the extension can be updated to read from `.pi/prompts/` if needed, or the pi agent package can add custom materialization on top of `materializeTasks()`.

**[Breaking change to ResolvedTask]** → Any downstream code referencing removed properties will break at compile time. Mitigated by: TypeScript compiler catches all references; the blast radius is well-mapped (15 files).

**[collectAllSkills loses task-level skill collection]** → Skills referenced only through tasks (not roles directly) would be missed. Mitigated by: with the new model, skills are declared on roles, not tasks. Tasks are just prompts and don't have skill dependencies.

**[Adapter leaves prompt undefined]** → The adapter produces tasks with `prompt: undefined`, requiring a second pass (`resolveTaskContent`) to populate content. This is intentional — the adapter is stateless and cannot read files. Mitigated by: `resolveTaskContent()` is called in all materialization paths (both `materializeForAgent()` and docker-generator supervisor), ensuring content is always resolved before the materializer generates output files.

**[Source path required for content resolution]** → If a role has no `source.path`, task content cannot be resolved and prompts remain undefined. Mitigated by: local roles always have a path, and packaged roles now include `path: packagePath` in their source object.

## Open Questions

None — all resolved.
