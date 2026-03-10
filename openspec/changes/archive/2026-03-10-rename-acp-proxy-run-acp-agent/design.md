# Design: Rename `acp-proxy` to `run-acp-agent`

## Overview

This is primarily a rename/refactor change. The `acp-proxy` command becomes `run-acp-agent` with the addition of CLAWMASONS_HOME support and auto-init behavior.

## File Changes

### 1. Rename source file
- `packages/cli/src/cli/commands/acp-proxy.ts` -> `packages/cli/src/cli/commands/run-acp-agent.ts`

### 2. Type/function renames in `run-acp-agent.ts`
- `AcpProxyOptions` -> `RunAcpAgentOptions`
- `AcpProxyDeps` -> `RunAcpAgentDeps`
- `registerAcpProxyCommand` -> `registerRunAcpAgentCommand`
- `acpProxy` -> `runAcpAgent`
- Command name: `"acp-proxy"` -> `"run-acp-agent"`
- All `[chapter acp-proxy]` log prefixes -> `[chapter run-acp-agent]`

### 3. Add CLAWMASONS_HOME + auto-init (same pattern as run-agent)
New deps added to `RunAcpAgentDeps`:
- `getClawmasonsHomeFn`
- `findRoleEntryByRoleFn`
- `initRoleFn`
- `ensureGitignoreEntryFn`

New behavior before starting Docker session:
1. Read `CLAWMASONS_HOME/chapters.json` to find role entry
2. If not found, auto-invoke `init-role`
3. Use `roleDir` from chapters.json for docker build path
4. Ensure `.clawmasons` in project `.gitignore`

### 4. Update `commands/index.ts`
- Import `registerRunAcpAgentCommand` from `./run-acp-agent.js`
- Add to `registerCommands`

### 5. Update `warnings.ts`
- Change `[chapter acp-proxy]` prefix to `[chapter run-acp-agent]`

### 6. Rename test file
- `packages/cli/tests/cli/acp-proxy.test.ts` -> `packages/cli/tests/cli/run-acp-agent.test.ts`
- Update all imports and references
- Add tests for auto-init behavior

### 7. Update e2e test
- `e2e/tests/acp-proxy.test.ts`: No command name changes needed (it doesn't invoke the CLI command by name, uses Docker directly)

### 8. Update build.test.ts
- The test that verifies `acp-proxy` is NOT a registered command should be removed or updated since `run-acp-agent` IS now registered

## Acceptance Criteria

1. `chapter run-acp-agent --role writer` starts ACP endpoint (same behavior as old `acp-proxy`)
2. Auto-inits role if not in `chapters.json`
3. Uses `CLAWMASONS_HOME` for role resolution
4. All existing ACP proxy tests pass under new command name
5. `acp-proxy` command still does not exist (already removed in CHANGE 3)
6. `run-acp-agent` IS a registered command
