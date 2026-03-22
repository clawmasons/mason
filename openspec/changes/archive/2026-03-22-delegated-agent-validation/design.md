# Design: Delegated Agent Validation

**Spec:** delegated-agent-validation
**PRD:** agent-config — Change #6
**Date:** 2026-03-22
**Status:** Design

---

## Overview

Replace the hardcoded `checkLlmConfig()` function in `validate.ts` with a delegation loop that calls `AgentPackage.validate()` for each runtime in the agent's `runtimes` array. Add `validate` to `claude-code-agent`.

## Architecture

### Claude-Code-Agent Validate Function

Add to `packages/claude-code-agent/src/index.ts`:

```typescript
validate: (agent: ResolvedAgent): AgentValidationResult => {
  const warnings = [];
  if (agent.llm) {
    warnings.push({
      category: "llm-config",
      message: `Agent "${agent.agentName}" uses runtime "claude-code-agent" with an "llm" configuration. Claude Code only supports Anthropic — the "llm" field will be ignored.`,
      context: { agent: agent.name, runtime: "claude-code-agent" },
    });
  }
  return { errors: [], warnings };
},
```

### Validator Refactoring

The key change is in `packages/cli/src/validator/validate.ts`:

1. **New signature**: `validateAgent(agent, agentRegistry?)` — The optional `agentRegistry` parameter is of type `AgentRegistry` (a `Map<string, AgentPackage>` from agent-sdk). When omitted, the function skips delegated validation (backward compatible for any callers that don't have a registry).

2. **Replace `checkLlmConfig()`** with `checkAgentValidation()`:

```typescript
function checkAgentValidation(
  agent: ResolvedAgent,
  errors: ValidationError[],
  warnings: ValidationWarning[],
  agentRegistry?: AgentRegistry,
): void {
  if (!agentRegistry) return;

  // Deduplicate: multiple runtimes may resolve to the same AgentPackage
  const seen = new Set<string>();
  for (const runtime of agent.runtimes) {
    const agentPkg = agentRegistry.get(runtime);
    if (!agentPkg || !agentPkg.validate || seen.has(agentPkg.name)) continue;
    seen.add(agentPkg.name);

    const result = agentPkg.validate(agent);
    for (const err of result.errors) {
      errors.push({
        category: err.category as ValidationErrorCategory,
        message: err.message,
        context: err.context as ValidationError["context"],
      });
    }
    for (const warn of result.warnings) {
      warnings.push({
        category: warn.category as ValidationWarningCategory,
        message: warn.message,
        context: warn.context as ValidationWarning["context"],
      });
    }
  }
}
```

3. **Update `validateAgent()`**: Replace `checkLlmConfig(agent, errors, warnings)` with `checkAgentValidation(agent, errors, warnings, agentRegistry)`.

### Type Mapping

Agent packages use `AgentValidationError` / `AgentValidationWarning` (from agent-sdk, with `string` category and `Record<string, string | undefined>` context). The CLI validator uses `ValidationError` / `ValidationWarning` (with union type categories and specific context shapes). The delegation function maps between these with type assertions.

## Data Flow

```
validateAgent(agent, registry)
  ├─ checkToolExistence(...)
  ├─ checkAppLaunchConfig(...)
  ├─ checkAgentValidation(agent, errors, warnings, registry)
  │    └─ for each runtime in agent.runtimes:
  │         ├─ registry.get(runtime) → AgentPackage
  │         └─ agentPkg.validate(agent) → { errors, warnings }
  │              └─ merge into validator's collections
  └─ checkCredentialCoverage(...)
```

## Test Coverage

### Existing Tests (Updated)

All existing `llm-config` tests in `validate.test.ts` must continue to pass with identical assertions. The tests will be updated to provide a mock `AgentRegistry` containing pi-coding-agent (with its `validate`) and claude-code-agent (with its new `validate`).

### New Tests

1. **Agent without validate function** — Runtime in `agent.runtimes` maps to an `AgentPackage` without `validate`. No errors or warnings produced.
2. **Unknown runtime** — Runtime not in registry. No errors or warnings (graceful skip).
3. **No registry provided** — `validateAgent(agent)` without registry parameter. No agent-specific validation runs (backward compatible).
4. **Deduplication** — Agent with duplicate runtime entries. `validate` called only once per unique `AgentPackage.name`.

## Files Changed

| File | Change |
|------|--------|
| `packages/claude-code-agent/src/index.ts` | Add `validate` function that warns when `agent.llm` is set |
| `packages/cli/src/validator/validate.ts` | Replace `checkLlmConfig()` with `checkAgentValidation()`. Add `agentRegistry` param to `validateAgent()`. |
| `packages/cli/src/validator/index.ts` | Re-export updated `validateAgent` signature |
| `packages/cli/tests/validator/validate.test.ts` | Update tests to provide mock registry, add new delegation tests |

## Edge Cases

- **Agent with no runtimes** — Empty `agent.runtimes` array. Loop body never executes. No errors or warnings.
- **Agent with both pi and claude runtimes** — Both `validate` functions called. Pi may produce error (no llm), claude may produce warning (has llm). These are independent.
- **AgentPackage.validate returns empty** — Valid result: `{ errors: [], warnings: [] }`. No effect on validation.
