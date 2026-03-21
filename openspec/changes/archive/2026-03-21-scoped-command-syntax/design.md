## Context

Commands (tasks) are currently referenced in ROLE.md files using `/` syntax (`opsx/apply`), while users invoke them with `:` syntax (`/opsx:apply`). The task loader (`readTasks()`) discovers commands by scanning entire directories — walking subdirectories recursively for path format or listing flat directories for kebab format. This is wasteful because ROLE.md already declares the exact set of commands needed. Worse, the current name-matching in `resolveTaskContent()` is broken for scoped tasks: `readTasks()` returns `{ name: "apply", scope: "opsx" }` but the lookup uses the full ROLE.md reference `"opsx/apply"`, which doesn't match.

The `AgentTaskConfig.nameFormat` template already has enough information to deterministically construct a file path from a task's scope and name. We should leverage this instead of scanning.

## Goals / Non-Goals

**Goals:**
- Unify scope syntax to `:` everywhere — ROLE.md declarations, ResolvedTask, and user-facing invocations
- Replace directory-scanning discovery with direct file-path construction from scope+name
- Fix the broken scope matching in `resolveTaskContent()` — tasks with scope should resolve correctly
- Keep `materializeTasks()` unchanged — it already handles `:` scope correctly

**Non-Goals:**
- Changing the on-disk file layout (`.claude/commands/opsx/apply.md` stays as-is)
- Modifying `materializeTasks()` — it already converts `:` to paths/prefixes
- Supporting dynamic task discovery (finding tasks not declared in ROLE.md)
- Changing how skills or apps are resolved

## Decisions

### Decision 1: `:` as canonical scope delimiter in ROLE.md

ROLE.md task references will use `:` syntax (`opsx:apply`) matching user-facing invocation syntax (`/opsx:apply`). The parser will split on the **last** `:` to extract scope and name: `"opsx:apply"` → `{ scope: "opsx", name: "apply" }`. For deeply nested scopes: `"ops:triage:apply"` → `{ scope: "ops:triage", name: "apply" }`.

Tasks without scope remain as bare names: `"doc-cleanup"` → `{ scope: "", name: "doc-cleanup" }`.

**Why `:` over `/`**: The `:` is already the internal scope delimiter on `ResolvedTask.scope` and in `scopeToPath()`/`scopeToKebab()`. Using `/` in ROLE.md created a confusing mismatch where the parser had to convert between formats.

**Alternative considered**: Keep `/` in ROLE.md and only convert at parse time. Rejected because it perpetuates the syntax mismatch and adds unnecessary conversion logic.

### Decision 2: Scope extraction moves to `adaptTask()`

Currently `adaptTask()` in `packages/shared/src/role/adapter.ts` creates `{ name: "opsx/apply", version: "0.0.0" }` with no scope extraction. The new implementation will split the `:` delimiter:

```typescript
function adaptTask(task: TaskRef): ResolvedTask {
  const colonIdx = task.name.lastIndexOf(":");
  if (colonIdx === -1) {
    return { name: task.name, version: "0.0.0" };
  }
  return {
    name: task.name.slice(colonIdx + 1),
    scope: task.name.slice(0, colonIdx),
    version: "0.0.0",
  };
}
```

**Why `adaptTask()` and not `normalizeTasks()`**: The parser (`normalizeTasks`) normalizes raw YAML to `{ name: string }` objects. Scope extraction is a semantic transform that belongs in the adapter layer where `TaskRef` becomes `ResolvedTask`. This keeps the parser dialect-agnostic.

### Decision 3: New `readTask()` for single-file targeted reads

Add a new exported function `readTask()` (singular) that constructs the expected file path and reads it directly:

```typescript
export function readTask(
  config: AgentTaskConfig,
  projectDir: string,
  name: string,
  scope: string,
): ResolvedTask | undefined
```

It will:
1. Call `resolveNameFormat(config.nameFormat, name, scope)` to get the relative path
2. Prepend `config.projectFolder` and `projectDir` to build the absolute path
3. If the file exists, read and parse it (frontmatter + body)
4. Return a `ResolvedTask` with the given name, scope, and parsed content
5. Return `undefined` if the file doesn't exist

The existing `readTasks()` (plural) remains available for backward compatibility (e.g., cross-agent portability round-trips) but is no longer used by `resolveTaskContent()`.

**Why keep `readTasks()`**: It's still useful for bulk operations like cross-agent task migration and the round-trip tests. Removing it would break existing functionality without benefit.

### Decision 4: `resolveTaskContent()` uses targeted reads

Replace the current bulk-read-then-match pattern:

```typescript
// Before:
const sourceTasks = readTasks(sourceConfig, sourceProjectDir);
const sourceByName = new Map(sourceTasks.map((t) => [t.name, t]));
for (const task of resolvedRole.tasks) {
  const source = sourceByName.get(task.name); // broken for scoped tasks
}

// After:
for (const task of resolvedRole.tasks) {
  const source = readTask(sourceConfig, sourceProjectDir, task.name, task.scope ?? "");
  // direct file read — scope is already on the task from adaptTask()
}
```

This eliminates the map lookup entirely and fixes the scoped task matching bug.

## Risks / Trade-offs

**[Breaking change in ROLE.md syntax]** → Mitigated by updating all ROLE.md files in this repo as part of the change. External consumers (if any) will need to update their ROLE.md files. The change is mechanical: replace `/` with `:` in task references.

**[readTasks() still exists but unused by core path]** → Acceptable. It serves the round-trip test and cross-agent portability use cases. If it becomes truly dead code later, it can be removed.

**[No dynamic discovery]** → By design. If a task isn't declared in ROLE.md, it won't be found. This is a feature, not a bug — it prevents loading unintended commands.
