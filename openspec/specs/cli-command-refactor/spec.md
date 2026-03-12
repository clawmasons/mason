# Spec: CLI Command Refactor

**Status:** Implemented
**PRD:** [agent-roles](../../prds/agent-roles/PRD.md) — §8, §8.1, §8.2, §8.3, §9, §9.1, §9.2, §9.3
**Change:** #8 in [IMPLEMENTATION.md](../../prds/agent-roles/IMPLEMENTATION.md)

---

## Overview

Replace the `agent` CLI command with a `run` command that takes an agent type as a positional argument and `--role <name>` as a required option. Add shorthand syntax where `clawmasons <agent-type> --role <name>` is equivalent to `clawmasons run <agent-type> --role <name>`. Update `chapter list` to show roles, `chapter validate` to validate roles, and `chapter build` completion instructions.

## Command Structure

### Primary command
```
clawmasons run <agent-type> --role <role-name> [--acp] [--proxy-port <n>]
```

### Shorthand
```
clawmasons <agent-type> --role <role-name>
```

When the first positional argument doesn't match a known command but matches a known agent type (via aliases or registry), the CLI inserts `run` before it and re-parses.

### Agent Type Aliases

| Alias | Internal Type |
|-------|--------------|
| `claude` | `claude-code` |
| `codex` | `codex` |
| `aider` | `aider` |
| `pi` | `pi-coding-agent` |
| `mcp` | `mcp-agent` |

Direct registry names (e.g., `claude-code`) also work.

### Backward Compatibility

A hidden `agent` command is registered that preserves the old `clawmasons agent <agent> <role>` and `clawmasons agent --acp --role <name>` syntax.

## Files Modified

| File | Change |
|------|--------|
| `packages/cli/src/cli/commands/run-agent.ts` | Added `AGENT_TYPE_ALIASES`, `resolveAgentType()`, `isKnownAgentType()`, `getKnownAgentTypeNames()`. Renamed command registration to `registerRunCommand()`. `run` command accepts `<agent-type>` positional + `--role`. Hidden `agent` alias for backward compat. Updated help epilog. |
| `packages/cli/src/cli/commands/index.ts` | Imports `registerRunCommand` and `isKnownAgentType`. Installs shorthand detection via `installAgentTypeShorthand()` which overrides `program.parse/parseAsync` to rewrite argv. |
| `packages/cli/src/cli/commands/list.ts` | Replaced agent-centric listing with `discoverRoles()`. Shows role metadata, source (local/package), tasks, apps, skills. JSON mode outputs `RoleType[]`. |
| `packages/cli/src/cli/commands/validate.ts` | Now tries role validation first via `resolveRole()` + adapter round-trip. Falls back to agent validation. Provides npm install instructions for package-style role names not found. |
| `packages/cli/src/cli/commands/build.ts` | Updated completion instructions from `clawmasons agent` to `clawmasons run`. |

## Tests Modified

| File | Change |
|------|--------|
| `packages/cli/tests/cli/cli.test.ts` | Updated to check for `run` command, hidden `agent` alias, `--role` and `--acp` options. |
| `packages/cli/tests/cli/run-agent.test.ts` | Added tests for `resolveAgentType`, `isKnownAgentType`, `getKnownAgentTypeNames`. Updated command registration tests. |
| `packages/cli/tests/cli/list.test.ts` | Rewritten for role-centric listing using ROLE.md files. |
| `packages/cli/tests/cli/validate.test.ts` | Added role validation tests, install instruction tests, agent fallback test. |
| `packages/cli/tests/cli/build.test.ts` | Updated to check `clawmasons run` in completion instructions. |
| `packages/cli/tests/cli/run-acp-agent.test.ts` | Updated help text tests to reference `run` command. |

## Error Handling

When a role name looks like a package reference (contains `/` or starts with `@`) and is not found:
```
Error: Role "@acme/role-create-prd" not found.
  It is not a local role and is not installed as a package.
  To install: npm install --save-dev @acme/role-create-prd
```

Unknown agent types produce:
```
Unknown agent type "unknown".
Available agent types: aider, claude, claude-code, mcp, mcp-agent, pi, pi-coding-agent
```
