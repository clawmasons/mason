## Why

Today, users must always specify `--role <name>` (and optionally `--agent-type`) when running an agent — there is no per-project way to declare agent defaults (package, home directory, startup mode, role) in `.mason/config.json`. Adding `home`, `mode`, and `role` properties to agent config entries, plus a shorthand `mason {agent-name}` command, lets teams define opinionated agent launch profiles once and invoke them with a single word.

## What Changes

- Extend the `.mason/config.json` agent entry schema with three new optional properties: `home`, `mode`, and `role`
- **BREAKING** Rename `--agent-type` to `--agent` on the `run` command; the flag now resolves against `.mason/config.json` agent names first, then falls back to the existing agent-type registry
- Add `mason <agent-name>` positional shorthand that looks up an agent entry by name and applies its config defaults (package, home, mode, role)
- Add `--home <path>` CLI flag to override the home directory for the current invocation
- Add `--terminal` CLI flag to explicitly select terminal mode (overriding a config-declared `mode`)
- Auto-create `.mason/config.json` from a default template when it does not exist and `mason run --agent` is invoked

## Capabilities

### New Capabilities

- `agent-config-extended-properties`: Extended `.mason/config.json` agent entry schema — `home` (alternative home directory lifted into Docker), `mode` (`terminal` | `acp` | `bash`, default `terminal`), and `role` (default role name). CLI flags `--home` and `--terminal` override the corresponding config values per-invocation.
- `agent-shorthand-command`: `mason <agent-name>` positional shorthand already exists via `installAgentTypeShorthand` but only recognizes built-in agents at parse time. This capability extends it to also recognize config-declared agent names by reading `.mason/config.json` agent keys before the parse phase. `mason run --agent <name>` (renamed from `--agent-type`) resolves agent name from config first, then falls back to the existing agent-type registry; config defaults (role, mode, home) are applied when matched and remain overridable via explicit CLI flags.
- `mason-config-template-init`: When `.mason/config.json` does not exist and an agent-by-name invocation is attempted, automatically create the file from a well-known default template (containing `claude`, `pi-mono-agent`, and `mcp` entries) before proceeding.

### Modified Capabilities

- `agent-discovery`: The config loading logic must now parse and validate the three new optional fields (`home`, `mode`, `role`) in each agent entry, in addition to the existing `package` field. Invalid values for `mode` (not one of `terminal`, `acp`, `bash`) SHALL be skipped with a warning.

## Impact

- `packages/cli/src/cli/commands/run-agent.ts` — rename `--agent-type` to `--agent`; add `--home` and `--terminal` flags; integrate config-derived defaults into the run flow
- `packages/cli/src/materializer/role-materializer.ts` (or wherever `initRegistry` / agent-discovery lives) — parse and expose `home`, `mode`, `role` from config entries
- `.mason/config.json` schema — extended entry shape
- CLI binary entry point — `mason <agent-name>` shorthand already exists via `installAgentTypeShorthand`; it must be extended to load config-declared agent names before parse time so they are recognized by the shorthand check
