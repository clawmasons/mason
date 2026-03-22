## Why

The `--source` flag is needed to let users override which agent directories are scanned when materializing a role. Currently, a role's `sources` field is baked into its ROLE.md and cannot be overridden from the CLI. A developer who has a `developer` role sourcing from `.claude/` cannot temporarily switch to `.codex/` without editing the file.

This change adds a repeatable `--source <name>` flag to the `run` command. When provided alongside `--role`, it replaces the role's `sources` array before materialization. The flag accepts short names (`claude`), dot-prefixed directory names (`.claude`), or full dialect registry keys (`claude-code-agent`). All forms are normalized to the registry key. Invalid values produce an error listing available sources.

This change is scoped to flag parsing and source override on existing roles only. Project role generation (using `--source` without `--role`) is deferred to Change 5.

## What Changes

- **`packages/shared/src/role/dialect-registry.ts`** — Add `resolveDialectName()` function that normalizes any accepted input form (`.claude`, `claude`, `claude-code-agent`) to the dialect registry key. Returns `undefined` for unrecognized inputs.

- **`packages/cli/src/cli/commands/run-agent.ts`**:
  - Add `--source <name>` option (repeatable via Commander's `Option` with `.argParser()` collecting into an array) to the `run` command definition in `registerRunCommand()`.
  - Add `source` to the options type in `createRunAction()`.
  - After role resolution (line ~601) and before passing to `runAgent()`, validate and normalize `--source` values using `resolveDialectName()`. If any value is invalid, error with available sources list.
  - If valid `--source` values are present, mutate `roleType.sources` on the resolved role before it reaches materialization. This is done inside `runAgent()` after role resolution in each mode function.

- **`packages/shared/tests/role/dialect-registry.test.ts`** — New test file for `resolveDialectName()` covering all input forms and error cases.

- **`packages/cli/tests/cli/run-agent.test.ts`** — Add tests for `--source` flag registration, `normalizeSourceFlags()` validation and normalization, and source override behavior.

## Capabilities

### New Capabilities
- `resolve-dialect-name`: Normalizes `.claude` / `claude` / `claude-code-agent` to the dialect registry key
- `source-cli-flag`: Repeatable `--source` flag on the `run` command that overrides role sources

### Modified Capabilities
- `run-command`: Accepts `--source` option, validates against dialect registry, overrides resolved role's `sources` field

## Impact

- New file: `packages/shared/tests/role/dialect-registry.test.ts`
- Modified file: `packages/shared/src/role/dialect-registry.ts` (add `resolveDialectName`)
- Modified file: `packages/cli/src/cli/commands/run-agent.ts` (add `--source` flag, validation, override logic)
- Modified file: `packages/cli/tests/cli/run-agent.test.ts` (add `--source` tests)
- No breaking changes to public API
