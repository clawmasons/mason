## Why

Commands in ROLE.md currently use `/` syntax (`opsx/apply`) while user-facing invocations use `:` syntax (`/opsx:apply`). The task loader (`readTasks()`) discovers commands by scanning entire directories recursively, which is unnecessary when the ROLE.md already declares exact command references. By adopting `:` as the canonical scope delimiter everywhere and constructing the expected file path directly from the scope+name, we eliminate directory scanning, enforce strict scope matching, and unify the syntax between ROLE.md declarations and user-facing invocations.

## What Changes

- **BREAKING**: ROLE.md task references change from `/` syntax to `:` syntax (e.g., `opsx/apply` → `opsx:apply`)
- **BREAKING**: `readTasks()` is replaced with a targeted `readTask()` that constructs the expected file path from scope+name using the `AgentTaskConfig.nameFormat` template, then reads that single file directly — no directory scanning
- Commands are only loaded when both scope and name match the dialect's expected file path — prevents loading unscoped or mismatched commands
- Lead and developer ROLE.md files updated to use `:` syntax for all task references
- The adapter layer (`adaptTask()`) parses `:` from task names to populate `scope` on `ResolvedTask`

## Capabilities

### New Capabilities

- `scoped-command-resolution`: Direct file-path-based command resolution from scope:name references, replacing directory-scanning discovery

### Modified Capabilities

- `task-read-write`: `readTasks()` changes to targeted single-file reads instead of directory walks; task name parsing expects `:` as scope delimiter
- `role-md-parser-dialect-registry`: Task name normalization in the parser must handle `:` syntax and split scope from name during parsing

## Impact

- **`packages/agent-sdk/src/helpers.ts`**: Core change — `readTasks()` replaced/refactored to `readTask()` for single-file targeted reads; `scopeToPath()` and `scopeToKebab()` remain but are used differently
- **`packages/shared/src/role/parser.ts`**: `normalizeTasks()` must parse `:` from task names to extract scope
- **`packages/shared/src/role/adapter.ts`**: `adaptTask()` must split `name` on `:` to populate `scope` field
- **`packages/cli/src/materializer/role-materializer.ts`**: `resolveTaskContent()` changes to use targeted reads instead of bulk `readTasks()`
- **`.mason/roles/lead/ROLE.md`**: All 20 task references updated from `opsx/apply` to `opsx:apply` etc.
- **`.mason/roles/developer/ROLE.md`**: Task references updated from `opsx/apply` to `opsx:apply`
- **`packages/agent-sdk/tests/tasks.test.ts`**: Tests updated for new resolution behavior
- **Existing on-disk command files** (`.claude/commands/opsx/apply.md` etc.) are unaffected — only how they're referenced and looked up changes
