## Why

The Mason dialect's `MASON_TASK_CONFIG` uses `kebab-case-prefix` scope format, which makes it impossible to distinguish scope from task name (e.g., `opsx-apply.md` — is the scope `opsx` with name `apply`, or is it an unscoped task named `opsx-apply`?). This ambiguity breaks the `readTask()` targeted resolution introduced in `scoped-command-syntax`. Additionally, task references in ROLE.md should accept both `:` and `/` as scope delimiters since both are natural — `:` is the internal canonical form and `/` mirrors directory structure.

## What Changes

- **BREAKING**: `MASON_TASK_CONFIG` switches from `kebab-case-prefix` to `path` scope format — tasks now live at `.mason/tasks/opsx/apply.md` instead of `.mason/tasks/opsx-apply.md`
- `MASON_TASK_CONFIG.nameFormat` changes from `"{scopeKebab}-{taskName}.md"` to `"{scopePath}/{taskName}.md"`
- `adaptTask()` normalizes both `:` and `/` delimiters — `"opsx:apply"` and `"opsx/apply"` both produce `{ name: "apply", scope: "opsx" }`
- `normalizeTasks()` in the parser accepts both `:` and `/` in task references without modification (delimiter normalization happens in the adapter)

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `task-read-write`: Mason's canonical task config changes from kebab-case-prefix to path scope format
- `role-md-parser-dialect-registry`: Task references in ROLE.md accept both `:` and `/` as scope delimiters; `adaptTask()` normalizes `/` to `:` before splitting

## Impact

- **`packages/cli/src/materializer/role-materializer.ts`**: `MASON_TASK_CONFIG` changes `scopeFormat` and `nameFormat`
- **`packages/shared/src/role/adapter.ts`**: `adaptTask()` updated to normalize `/` to `:` before splitting on last `:`
- **`packages/agent-sdk/tests/tasks.test.ts`**: `allFieldsConfig` fixture updated to match new Mason config
- **`packages/shared/tests/role-adapter.test.ts`**: New tests for `/`-delimited task references
- **Existing `.mason/tasks/` files**: Would need to be moved from flat kebab files to nested path directories (migration concern for any external consumers)
