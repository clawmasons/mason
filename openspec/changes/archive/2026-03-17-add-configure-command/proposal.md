## Why

Running with the configure-project supervisor role requires knowing the exact role reference (`@clawmasons/role-configure-project`) and the `--role` flag syntax. A dedicated `configure` command makes project setup the natural first action without requiring users to recall internal role naming.

## What Changes

- Add a new top-level `configure` CLI command that accepts all `run` arguments except `--role`
- The command is an alias for `mason run --role @clawmasons/role-configure-project <...args>`
- `--role` is excluded from `configure` (it is hardcoded to `configure-project`)

## Capabilities

### New Capabilities
- `configure-command`: New `mason configure` CLI command — all `run` options minus `--role`, hardcoded to use the configure-project supervisor role

### Modified Capabilities
<!-- none — run-command behavior is unchanged -->

## Impact

- `packages/cli/src/cli/` — new command file and registration in the CLI entry point
- No changes to run logic, agent resolution, or role loading
- Docs: CLI reference will need a new `configure` entry
