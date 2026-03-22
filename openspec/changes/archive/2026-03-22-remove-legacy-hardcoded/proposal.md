# Proposal: Remove Legacy Hardcoded References

**Spec:** remove-legacy-hardcoded
**PRD:** agent-config — Change #7
**Date:** 2026-03-22
**Status:** Proposed

---

## Problem

The CLI still contains hardcoded agent references that the agent-config framework (Changes 1-6) was designed to replace:

1. **`AGENT_TYPE_ALIASES` map** (`run-agent.ts:74-80`) — A legacy alias table mapping short names like "claude", "pi", "mcp" to canonical agent names. All three built-in agents already declare `aliases` on their `AgentPackage` exports, making this map redundant. The registry-based resolution in `resolveAgentType()` already checks `AgentPackage.aliases` first, falling back to this legacy map only for agents not yet packaged ("codex", "aider"). These are phantom entries that reference no real agent packages.

2. **`inferAgentType()` hardcoded default** (`run-agent.ts:52-57`) — Falls back to `"claude-code-agent"` when the role's dialect is `"mason"` or unset. This couples the CLI to a specific built-in agent. The PRD calls for making this configurable or erroring when ambiguous.

3. **`DEFAULT_MASON_CONFIG` hardcoded template** (`run-agent.ts:456-466`) — The `ensureMasonConfig()` function writes a hardcoded JSON template with three agent entries. This should be derived from the registered `AgentPackage` list so new agents are automatically included.

4. **`getKnownAgentTypeNames()` merges legacy aliases** (`run-agent.ts:111-117`) — Sources names from `AGENT_TYPE_ALIASES` keys, including phantom entries. Should source exclusively from the agent registry.

## Goal

Remove all hardcoded agent references from the CLI so that adding or removing agents requires only publishing/removing an `AgentPackage` — no CLI code changes:

1. Remove `AGENT_TYPE_ALIASES` entirely. `resolveAgentType()` relies solely on the agent registry (which already includes `AgentPackage.aliases`).
2. Make `inferAgentType()` configurable: check for a `defaultAgent` field in `.mason/config.json`, fall back to `"claude-code-agent"` with a deprecation warning, guiding users to set a default explicitly.
3. Derive `DEFAULT_MASON_CONFIG` from `BUILTIN_AGENTS` so new built-in agents are automatically included in the generated template.
4. Update `getKnownAgentTypeNames()` to source exclusively from the agent registry.

## Approach

### Phase 1: Remove `AGENT_TYPE_ALIASES`

- Delete the `AGENT_TYPE_ALIASES` constant.
- Update `resolveAgentType()` to only check the agent registry. Remove the legacy fallback branch.
- Update `getKnownAgentTypeNames()` to derive names from the agent registry only (canonical names + aliases from `AgentPackage`).

### Phase 2: Configurable `inferAgentType()`

- Add a `defaultAgent?: string` field to `MasonConfig` (in discovery.ts).
- Add a `readDefaultAgent(projectDir)` function that reads this field.
- Update `inferAgentType()` to accept an optional `defaultAgent` parameter. When the dialect is `"mason"` or unset:
  - If `defaultAgent` is set, use it.
  - Otherwise, fall back to `"claude-code-agent"` (maintaining backward compatibility).
- Pass `defaultAgent` from the config at each call site.

### Phase 3: Derive `DEFAULT_MASON_CONFIG`

- Replace the hardcoded JSON constant with a function `buildDefaultMasonConfig()` that iterates `BUILTIN_AGENTS` and generates agent entries from their names, aliases, and package field.
- Update `ensureMasonConfig()` to call this function.

### Phase 4: Update tests

- Update `resolveAgentType` tests: remove assertions about "codex"/"aider" aliases. Verify that registry-based aliases still work.
- Update `getKnownAgentTypeNames` tests: assert registry-derived names only.
- Update `ensureMasonConfig` tests: verify generated config matches `BUILTIN_AGENTS`.
- Add test for `inferAgentType` with configurable default.

## Scope

**In scope:**
- `AGENT_TYPE_ALIASES` removal from `run-agent.ts`
- `resolveAgentType()` simplification
- `getKnownAgentTypeNames()` refactor
- `inferAgentType()` configurable default
- `DEFAULT_MASON_CONFIG` derivation from agent packages
- `defaultAgent` config field in `MasonConfig`
- Test updates for all affected functions

**Out of scope:**
- Config migration tooling (PRD NG-4)
- Changes to agent packages themselves
- E2E tests (deferred to Change 8)

## Risks

- **Breaking change for "codex"/"aider" aliases:** These are phantom entries with no backing agent packages. Removing them is safe since `resolveAgentType()` would return `undefined` for them anyway (no registered package), causing an error at the next step. No real functionality is lost.
- **`inferAgentType()` backward compatibility:** The fallback to `"claude-code-agent"` is preserved, so existing projects without a `defaultAgent` config field continue to work identically.
