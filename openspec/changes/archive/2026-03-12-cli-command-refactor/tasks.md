# Tasks: CLI Command Refactor

## Implementation Tasks

- [x] 1. Add agent type aliases and resolution
  - Add `AGENT_TYPE_ALIASES` mapping in `run-agent.ts`
  - Add `resolveAgentType()` to map user input to internal agent type
  - Add `isKnownAgentType()` for shorthand detection

- [x] 2. Refactor `run-agent.ts` — rename command to `run`
  - Change `registerRunAgentCommand` to `registerRunCommand`
  - Command becomes `run` with `<agent-type>` positional arg
  - Add `--role <name>` as required option
  - Update `runAgent()` to use ROLE_TYPES pipeline:
    - `resolveRole()` -> `RoleType`
    - `materializeForAgent()` or delegate to existing Docker pipeline
  - Keep hidden `agent` command for backward compat

- [x] 3. Add shorthand detection in `index.ts`
  - After registering all commands, intercept unknown commands
  - Check against `isKnownAgentType()` and aliases
  - If matched, delegate to `run` command logic

- [x] 4. Refactor `list.ts` — role-centric listing
  - Replace agent discovery with `discoverRoles()`
  - Display roles with source (local/package), tasks, apps, skills
  - JSON mode outputs `RoleType[]` array
  - Fall back to agent-based listing when no roles found (transition)

- [x] 5. Refactor `validate.ts` — role validation
  - Accept role name instead of agent name
  - Use `resolveRole()` + adapter round-trip for validation
  - Clear error message with install instructions for missing packaged roles

- [x] 6. Update `build.ts` — role-based materialization
  - Add role discovery alongside agent discovery
  - Materialize Docker dirs for discovered roles

- [x] 7. Write unit tests
  - CLI registers `run` command at top level
  - `run claude --role create-prd` parses correctly
  - Shorthand `claude --role create-prd` works
  - Unknown agent type produces error with available types
  - `--acp` flag works on `run` command
  - Hidden `agent` command still works for backward compat
  - `chapter list` shows roles
  - Missing packaged role produces clear error with install instructions
  - Agent type aliases resolve correctly

- [x] 8. Update existing tests
  - Update `cli.test.ts` to check for `run` command
  - Update `run-agent.test.ts` for new arg parsing
  - Update `list.test.ts` for role-centric output
  - Update `validate.test.ts` for role validation
