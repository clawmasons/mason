## Why

The CLI pre-parse hook in `commands/index.ts` already rewrites `mason <agent>` to `mason run <agent>` when the first positional argument matches a known agent type (`isKnownAgentType`) or a config-declared agent name (`readConfigAgentNames`). However, two gaps remain:

1. **Config-declared aliases are not checked.** The `readConfigAliasNames()` function exists in `@clawmasons/agent-sdk` but is not consulted in the shorthand detection. A user who adds an alias (e.g., `dev` -> claude with role developer) in `.mason/config.json` cannot type `mason dev` — the CLI does not recognize it as a shorthand.

2. **No helpful error on unknown input.** When the first argument matches nothing (not a command, not an agent type, not an alias), Commander produces a generic error. The PRD requires listing available commands and agent types so the user can self-correct.

This change completes the fallthrough chain: known commands -> config aliases -> agent types (built-in + config-declared) -> error with available options.

## What Changes

- `packages/cli/src/cli/commands/index.ts`:
  - Import `readConfigAliasNames` from `@clawmasons/agent-sdk`.
  - Add config alias names to the shorthand detection set.
  - When the first argument is not a known command and not a shorthand target, print an error listing available commands, agent types, and configured aliases, then exit.

- `packages/cli/tests/cli/commands-index.test.ts` (new test file):
  - Test that known agent types trigger shorthand rewrite.
  - Test that config-declared alias names trigger shorthand rewrite.
  - Test that unknown first arguments produce an error listing available options.
  - Test that known commands are not rewritten.

## Capabilities

### Modified Capabilities
- `cli-shorthand-detection`: Extended to include config aliases and produce helpful error messages for unknown inputs.

## Impact

- Modified file: `packages/cli/src/cli/commands/index.ts` (add alias check, add error handling)
- New test file: `packages/cli/tests/cli/commands-index.test.ts`
- No breaking changes — existing shorthand behavior preserved, only extended.
