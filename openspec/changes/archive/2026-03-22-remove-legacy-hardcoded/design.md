# Design: Remove Legacy Hardcoded References

**Spec:** remove-legacy-hardcoded
**PRD:** agent-config — Change #7
**Date:** 2026-03-22
**Status:** Design

---

## Overview

Remove three categories of hardcoded agent references from the CLI:
1. The `AGENT_TYPE_ALIASES` legacy alias map
2. The `DEFAULT_MASON_CONFIG` hardcoded template
3. The `getKnownAgentTypeNames()` dependency on the legacy alias map

Additionally, make `inferAgentType()` accept a configurable default agent. The `MasonConfig` interface gains an optional `defaultAgent` field.

## Detailed Design

### 1. Remove `AGENT_TYPE_ALIASES`

**File:** `packages/cli/src/cli/commands/run-agent.ts`

Delete the `AGENT_TYPE_ALIASES` constant (lines 74-80). This map currently contains:
- `claude` -> `claude-code-agent` (redundant: `AgentPackage.aliases = ["claude"]`)
- `pi` -> `pi-coding-agent` (redundant: `AgentPackage.aliases = ["pi"]`)
- `mcp` -> `mcp-agent` (redundant: `AgentPackage.aliases = ["mcp"]`)
- `codex` -> `codex` (phantom: no `codex` agent package exists)
- `aider` -> `aider` (phantom: no `aider` agent package exists)

**`resolveAgentType(input)`** simplifies to:

```typescript
export function resolveAgentType(input: string): string | undefined {
  const agentPkg = getAgentFromRegistry(input);
  return agentPkg?.name;
}
```

The registry already maps both canonical names and aliases to `AgentPackage` instances via `createAgentRegistry()`.

**`getKnownAgentTypeNames()`** simplifies to:

```typescript
export function getKnownAgentTypeNames(): string[] {
  const registry = getRegistryRef();
  const names = new Set<string>();
  for (const [key] of registry) {
    names.add(key);
  }
  return [...names].sort();
}
```

This requires exposing the registry map. We add a `getRegistryRef()` helper (or reuse the existing `getRegistry()` internal function) and iterate its keys to collect all registered names and aliases.

### 2. Derive `DEFAULT_MASON_CONFIG` from `BUILTIN_AGENTS`

**File:** `packages/cli/src/cli/commands/run-agent.ts`

Replace the hardcoded JSON constant with a function:

```typescript
function buildDefaultMasonConfig(): string {
  const agents: Record<string, { package: string }> = {};
  for (const agent of BUILTIN_AGENTS) {
    // Use the first alias as the config key (user-friendly short name),
    // falling back to the canonical name if no aliases are declared.
    const configKey = agent.aliases?.[0] ?? agent.name;
    agents[configKey] = { package: `@clawmasons/${agent.name}` };
  }
  return JSON.stringify({ agents }, null, 2);
}
```

This ensures new built-in agents are automatically included in the generated `.mason/config.json` template. The npm package name follows the convention `@clawmasons/<agent.name>`.

**Note:** The current template has `"pi-mono-agent"` as a key pointing to `@clawmasons/pi-mono-agent`, which is stale. The derived version will use `"pi"` (from `aliases[0]`) pointing to `@clawmasons/pi-coding-agent`, which is correct.

### 3. Configurable `inferAgentType()`

**File:** `packages/cli/src/cli/commands/run-agent.ts`

Update `inferAgentType()` to accept an optional default:

```typescript
export function inferAgentType(role: Role, defaultAgent?: string): string {
  const dialect = role.source.agentDialect;
  if (!dialect || dialect === "mason") {
    return defaultAgent ?? "claude-code-agent";
  }
  return dialect;
}
```

**File:** `packages/agent-sdk/src/discovery.ts`

Add `defaultAgent` to the `MasonConfig` interface and a reader function:

```typescript
interface MasonConfig {
  agents?: Record<string, unknown>;
  aliases?: Record<string, unknown>;
  defaultAgent?: string;
}

export function readDefaultAgent(projectDir: string): string | undefined {
  const config = readMasonConfig(projectDir);
  if (config?.defaultAgent && typeof config.defaultAgent === "string") {
    return config.defaultAgent;
  }
  return undefined;
}
```

At each call site in `run-agent.ts` and `build.ts`, pass the `defaultAgent`:

```typescript
const defaultAgent = readDefaultAgent(projectDir);
const agentType = agentOverride ?? inferAgentType(roleType, defaultAgent);
```

### 4. Expose Registry for `getKnownAgentTypeNames()`

The internal `getRegistry()` function in `role-materializer.ts` is not exported. Rather than export the registry Map directly, we add a function to get all registered names (both canonical and aliases):

```typescript
// In role-materializer.ts
export function getAllRegisteredNames(): string[] {
  const registry = getRegistry();
  return [...registry.keys()];
}
```

Then `getKnownAgentTypeNames()` in `run-agent.ts` calls this:

```typescript
export function getKnownAgentTypeNames(): string[] {
  const names = new Set<string>(getAllRegisteredNames());
  return [...names].sort();
}
```

## Test Coverage

### Updated Tests

1. **`resolveAgentType` tests** — Remove expectations for "codex"/"aider". Verify "claude", "pi", "mcp" still resolve via registry. Verify unknown agents return `undefined`.

2. **`isKnownAgentType` tests** — Remove "codex"/"aider" expectations. Verify all built-in agents and their aliases are known.

3. **`getKnownAgentTypeNames` tests** — Assert that names come from the registry, not the legacy alias map. Verify sorted output.

4. **`ensureMasonConfig` tests** — Update to verify derived config matches `BUILTIN_AGENTS` structure. Assert config keys are aliases, package names follow `@clawmasons/<name>` convention.

### New Tests

5. **`inferAgentType` with default** — Test that:
   - `inferAgentType(masonRole)` returns `"claude-code-agent"` (backward compat)
   - `inferAgentType(masonRole, "pi-coding-agent")` returns `"pi-coding-agent"`
   - `inferAgentType(dialectRole)` returns the dialect regardless of default

6. **`buildDefaultMasonConfig` derivation** — Test that all built-in agents appear in the generated config with correct keys and package names.

## Files Changed

| File | Change |
|------|--------|
| `packages/cli/src/cli/commands/run-agent.ts` | Remove `AGENT_TYPE_ALIASES`, simplify `resolveAgentType()`, update `getKnownAgentTypeNames()`, update `inferAgentType()`, derive `DEFAULT_MASON_CONFIG` |
| `packages/cli/src/materializer/role-materializer.ts` | Add `getAllRegisteredNames()` export |
| `packages/cli/src/cli/commands/build.ts` | Pass `defaultAgent` to `inferAgentType()` |
| `packages/cli/src/cli/commands/index.ts` | Remove `getKnownAgentTypeNames` import (if API changes) |
| `packages/agent-sdk/src/discovery.ts` | Add `defaultAgent` to `MasonConfig`, add `readDefaultAgent()` |
| `packages/agent-sdk/src/index.ts` | Export `readDefaultAgent` |
| `packages/cli/tests/cli/run-agent.test.ts` | Update all affected test suites |

## Backward Compatibility

- **`mason run claude`** — Still works. Registry resolves "claude" via `AgentPackage.aliases`.
- **`mason run pi`** — Still works. Registry resolves "pi" via `AgentPackage.aliases`.
- **`mason run codex`** — Now returns "Unknown agent" error. Previously it would resolve to `"codex"` via the alias map but then fail at the materializer step (no registered materializer). Behavior is equivalent: the user sees an error either way.
- **`inferAgentType()` default** — Falls back to `"claude-code-agent"` when no `defaultAgent` is set. Existing projects are unaffected.
- **Generated `config.json`** — New projects get updated agent entries. Existing `config.json` files are never overwritten.
