# Design: CLI Command Refactor

## Architecture

### 1. Command Structure Changes

**Before:**
```
clawmasons agent <agent-name> <role-name>
clawmasons agent --acp --role <name>
```

**After:**
```
clawmasons run <agent-type> --role <role-name>
clawmasons <agent-type> --role <role-name>     # shorthand
clawmasons run <agent-type> --role <name> --acp
```

Agent types are resolved from the materializer registry: `claude-code`, `pi-coding-agent`, `mcp-agent`. For convenience, shorthand aliases are supported: `claude` -> `claude-code`.

### 2. Shorthand Detection (index.ts)

In `registerCommands()`, after registering all known commands, hook into Commander's `command('*')` or use an argument pre-processor to detect when the first positional argument matches a known agent type but not a known command.

Implementation: Use Commander's `.on('command:*')` event to intercept unknown commands and check against agent type registry. If matched, re-invoke as `run <agent-type> <remaining-args>`.

### 3. Run Command Registration (run-agent.ts)

```typescript
registerRunCommand(program):
  program.command("run")
    .argument("<agent-type>", "Agent runtime (claude, codex, aider, ...)")
    .option("--role <name>", "Role name to run")
    .option("--acp", "Start in ACP mode")
    .option("--proxy-port <number>", "Internal proxy port", "3000")
    .option("--chapter <name>", "Chapter name for bootstrap")
    .option("--init-agent <name>", "Agent name override for bootstrap")
```

The `agent` command is kept as a hidden alias for backward compatibility.

### 4. Startup Sequence (ROLE_TYPES Pipeline)

Interactive mode:
1. `resolveRole(roleName, projectDir)` -> `RoleType`
2. Validate role definition
3. `materializeForAgent(role, agentType)` -> Docker workspace
4. Generate Docker build directory at `.clawmasons/docker/<role-name>/`
5. Create session directory at `.clawmasons/sessions/<session-id>/`
6. Docker Compose up (proxy)
7. Start credential service (in-process)
8. Docker Compose run (agent)

ACP mode follows the same pipeline but defers agent start to `session/new`.

### 5. Chapter List Refactor (list.ts)

Replace agent-centric listing with role-centric listing using `discoverRoles()`:

```
$ clawmasons chapter list

Available roles:
  create-prd (local, .claude/roles/create-prd/)
    tasks: define-change, review-change
    apps: github
    skills: @acme/skill-prd-writing

  code-review (package, @acme/role-code-review)
    tasks: review-pr
    apps: github, linear
```

JSON mode outputs `RoleType[]`.

### 6. Chapter Validate Refactor (validate.ts)

Accept a role name instead of an agent name. Use `resolveRole()` to load the role, then validate it via the adapter round-trip:

```
$ clawmasons chapter validate create-prd
```

### 7. Missing Package Role Error

When `resolveRole()` throws `RoleDiscoveryError` and the role name looks like a package reference (contains `/` or starts with `@`), emit:

```
Error: Role "@acme/role-create-prd" not found.
  It is not a local role and is not installed as a package.
  To install: npm install --save-dev @acme/role-create-prd
```

### 8. Agent Type Registry and Aliases

Agent types come from `getRegisteredAgentTypes()` in the materializer registry. Shorthand aliases map user-friendly names to internal types:

```typescript
const AGENT_TYPE_ALIASES: Record<string, string> = {
  "claude": "claude-code",
  "codex": "codex",
  "aider": "aider",
  "pi": "pi-coding-agent",
  "mcp": "mcp-agent",
};
```

### 9. Backward Compatibility

- `clawmasons agent` is registered as a hidden command that delegates to `run`.
- Existing ACP client configurations (`"args": ["agent", "--acp", ...]`) continue to work.
- The `agent` package type remains in schemas (removed in Change 11).
- The old `resolveAgentName()` function in `run-agent.ts` is kept for the legacy path but deprecated.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/cli/src/cli/commands/run-agent.ts` | Modify | Rename command to `run`, new arg parsing, role-based startup |
| `packages/cli/src/cli/commands/index.ts` | Modify | Register `run` + shorthand detection + hidden `agent` alias |
| `packages/cli/src/cli/commands/list.ts` | Modify | Use `discoverRoles()` for role-centric listing |
| `packages/cli/src/cli/commands/validate.ts` | Modify | Accept role name, validate via role pipeline |
| `packages/cli/src/cli/commands/build.ts` | Modify | Use role discovery for materialization |
| Test files | Modify/New | Update to test new command structure |
