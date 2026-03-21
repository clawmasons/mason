## Context

The `scoped-command-syntax` change introduced `readTask()` for targeted single-file resolution and switched `adaptTask()` to split on `:`. However, the Mason dialect's `MASON_TASK_CONFIG` still uses `kebab-case-prefix` format (`opsx-apply.md`), which is ambiguous — `readTask()` can't construct the right path without knowing where scope ends and name begins. Additionally, ROLE.md task references currently only accept `:` but `/` is a natural alternative that mirrors directory structure.

Current state of `MASON_TASK_CONFIG` in `role-materializer.ts`:
```typescript
const MASON_TASK_CONFIG: AgentTaskConfig = {
  projectFolder: ".mason/tasks",
  nameFormat: "{scopeKebab}-{taskName}.md",
  scopeFormat: "kebab-case-prefix",
  supportedFields: "all",
  prompt: "markdown-body",
};
```

Current state of `adaptTask()` in `adapter.ts`:
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

## Goals / Non-Goals

**Goals:**
- Switch `MASON_TASK_CONFIG` to `path` scope format so Mason tasks use nested directories (`.mason/tasks/opsx/apply.md`)
- Accept both `:` and `/` as scope delimiters in ROLE.md task references
- Keep the canonical internal delimiter as `:` on `ResolvedTask.scope`

**Non-Goals:**
- Removing `kebab-case-prefix` support from the generic `readTasks()`/`readTask()` functions — other agents (Pi) still use it
- Migrating existing `.mason/tasks/` files (no files currently exist in that layout in this repo)
- Changing how the Claude Code agent config works (it already uses `path` format)

## Decisions

### Decision 1: Normalize `/` to `:` in `adaptTask()`

Before splitting on the last `:`, `adaptTask()` will replace all `/` with `:` in the task name. This means both `"opsx:apply"` and `"opsx/apply"` produce `{ name: "apply", scope: "opsx" }`.

```typescript
function adaptTask(task: TaskRef): ResolvedTask {
  const normalized = task.name.replace(/\//g, ":");
  const colonIdx = normalized.lastIndexOf(":");
  if (colonIdx === -1) {
    return { name: normalized, version: "0.0.0" };
  }
  return {
    name: normalized.slice(colonIdx + 1),
    scope: normalized.slice(0, colonIdx),
    version: "0.0.0",
  };
}
```

**Why normalize in `adaptTask()` and not the parser**: The parser (`normalizeTasks()`) is dialect-agnostic — it just converts raw YAML strings to `{ name: string }`. Scope extraction is semantic and belongs in the adapter. Normalizing `/` → `:` here keeps it in one place.

### Decision 2: Switch `MASON_TASK_CONFIG` to path format

Change two fields:
- `scopeFormat`: `"kebab-case-prefix"` → `"path"`
- `nameFormat`: `"{scopeKebab}-{taskName}.md"` → `"{scopePath}/{taskName}.md"`

This aligns Mason with Claude Code's format. Both now use nested directories for scope.

**Why not keep kebab**: With kebab format, `readTask()` cannot construct the correct filename because it doesn't know how to split the kebab name back into scope + task name (e.g., `ops-triage-fix-bug` could be `ops:triage` + `fix-bug` or `ops` + `triage-fix-bug`). Path format is unambiguous.

### Decision 3: Update `allFieldsConfig` test fixture

The test fixture `allFieldsConfig` in `tasks.test.ts` mirrors `MASON_TASK_CONFIG`. It needs to be updated to use `path` format to keep tests aligned with the real config.

## Risks / Trade-offs

**[Breaking change for `.mason/tasks/` layout]** → Low risk. No files currently exist in `.mason/tasks/` in this repo. External consumers (if any) would need to move files from flat kebab layout to nested directories. The migration is mechanical.

**[Both `:` and `/` accepted]** → Could cause confusion about which to use. Mitigated by documenting `:` as the preferred/canonical syntax. `/` is accepted for convenience since it maps naturally to directory structure.
