# Design: Dynamic Dialect Self-Registration

**Spec:** dynamic-dialect-registration
**PRD:** agent-config — Change #5
**Date:** 2026-03-22
**Status:** Design

---

## Overview

Replace hardcoded agent-specific dialect registry entries with dynamic self-registration driven by `AgentPackage.dialect`. When an agent declares `dialect: "pi"`, the registry automatically creates a `DialectEntry` from the agent's metadata — no central registry edits needed.

## Architecture

### New `DialectFieldMapping` on AgentPackage

The `AgentPackage` interface already has `dialect?: string`. We add an optional `dialectFields` property to specify the ROLE.md frontmatter field name translations:

```typescript
// In packages/agent-sdk/src/types.ts, on AgentPackage:
dialectFields?: {
  tasks?: string;   // defaults to "tasks"
  apps?: string;    // defaults to "mcp_servers"
  skills?: string;  // defaults to "skills"
};
```

This allows agents to specify their vocabulary without requiring the shared package to import from agent-sdk (avoiding circular deps).

### `registerAgentDialect()` Function

New function in `packages/shared/src/role/dialect-registry.ts`:

```typescript
export interface AgentDialectInfo {
  name: string;
  dialect: string;
  dialectFields?: { tasks?: string; apps?: string; skills?: string };
  tasks?: AgentTaskConfig;
  skills?: AgentSkillConfig;
}

export function registerAgentDialect(info: AgentDialectInfo): void {
  registerDialect({
    name: info.name,
    directory: info.dialect,
    fieldMapping: {
      tasks: info.dialectFields?.tasks ?? "tasks",
      apps: info.dialectFields?.apps ?? "mcp_servers",
      skills: info.dialectFields?.skills ?? "skills",
    },
    taskConfig: info.tasks,
    skillConfig: info.skills,
  });
}
```

This function takes a lightweight info object (not `AgentPackage` directly) to avoid a dependency from `@clawmasons/shared` on `@clawmasons/agent-sdk`.

### Integration Point: `initRegistry()`

In `packages/cli/src/materializer/role-materializer.ts`, the `initRegistry()` function already calls `createAgentRegistry()`. After that, we iterate all registered agents and call `registerAgentDialect()` for those with a `dialect` field:

```typescript
export async function initRegistry(projectDir?: string): Promise<void> {
  _registry = await createAgentRegistry(BUILTIN_AGENTS, projectDir);
  // Dynamic dialect registration from agent packages
  for (const agent of _registry.values()) {
    if (agent.dialect) {
      registerAgentDialect({
        name: agent.name,
        dialect: agent.dialect,
        dialectFields: agent.dialectFields,
        tasks: agent.tasks,
        skills: agent.skills,
      });
    }
  }
}
```

We also update `getRegistry()` (the lazy sync path) to register dialects for built-in agents.

### Hardcoded Entry Removal

**Remove** from `dialect-registry.ts`:
- `claude-code-agent` static entry (lines 105-123)
- `mcp-agent` static entry (lines 145-153)
- `pi-coding-agent` first static entry (lines 155-173)
- `pi-coding-agent` duplicate static entry (lines 175-193)

**Keep** as static:
- `mason` — agent-agnostic, always needed
- `codex` — no AgentPackage in this monorepo
- `aider` — no AgentPackage in this monorepo

### Agent Package Changes

| Package | `dialect` | `dialectFields` |
|---------|-----------|-----------------|
| claude-code-agent | `"claude"` | `{ tasks: "commands" }` |
| pi-coding-agent | `"pi"` | `{ tasks: "prompts" }` |
| mcp-agent | `"mcp"` | `{ tasks: "commands" }` |

## Data Flow

```
CLI startup
  └─ initRegistry(projectDir)
       ├─ createAgentRegistry(BUILTIN_AGENTS, projectDir)  // builds agent registry
       └─ for each agent with `dialect`:
            └─ registerAgentDialect(info)
                 └─ registerDialect(entry)  // populates dialect maps
```

After `initRegistry()`, `getAllDialects()` returns the same set of dialects as before (mason + codex + aider + claude-code-agent + mcp-agent + pi-coding-agent), but the agent-specific ones are now populated dynamically.

## Test Coverage

### Unit Tests (`packages/shared/tests/dialect-registry.test.ts`)

1. **`registerAgentDialect` basic registration** — Call with minimal info, verify `getDialect()` returns correct entry.
2. **`registerAgentDialect` with custom field mapping** — Verify `dialectFields.tasks` overrides default.
3. **`registerAgentDialect` with task/skill config** — Verify `taskConfig` and `skillConfig` propagate.
4. **Existing `resolveDialectName` tests still pass** — The static codex/aider/mason entries still work. Claude/pi/mcp entries work after dynamic registration.
5. **Duplicate registration idempotency** — Calling `registerAgentDialect` twice with same name overwrites cleanly.

### Integration Tests (`packages/cli/tests/`)

- Verify `initRegistry()` populates dialect entries for built-in agents with `dialect` field.

## Edge Cases

- **Agent without `dialect`**: Skipped in the registration loop. No dialect entry created.
- **Config-declared agent with `dialect`**: Works the same as built-in — `createAgentRegistry` loads it, then `initRegistry` registers its dialect.
- **`getRegistry()` sync path**: Updated to also register dialects for built-in agents, so code that doesn't call `initRegistry()` still gets dialect entries.

## Files Changed

| File | Change |
|------|--------|
| `packages/agent-sdk/src/types.ts` | Add `dialectFields?` to `AgentPackage` |
| `packages/shared/src/role/dialect-registry.ts` | Add `registerAgentDialect()`, `AgentDialectInfo` type. Remove hardcoded claude/pi/mcp entries and duplicate pi entry. |
| `packages/shared/src/role/index.ts` | Export `registerAgentDialect`, `AgentDialectInfo` |
| `packages/shared/src/index.ts` | Export `registerAgentDialect`, `AgentDialectInfo` |
| `packages/cli/src/materializer/role-materializer.ts` | Call `registerAgentDialect()` in `initRegistry()` and `getRegistry()` |
| `packages/claude-code-agent/src/index.ts` | Add `dialect: "claude"`, `dialectFields: { tasks: "commands" }` |
| `packages/pi-coding-agent/src/index.ts` | Add `dialect: "pi"`, `dialectFields: { tasks: "prompts" }` |
| `packages/mcp-agent/src/agent-package.ts` | Add `dialect: "mcp"`, `dialectFields: { tasks: "commands" }` |
| `packages/shared/tests/dialect-registry.test.ts` | Add tests for `registerAgentDialect()`, update existing tests for dynamic flow |
