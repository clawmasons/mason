# Proposal: Delegated Agent Validation

**Spec:** delegated-agent-validation
**PRD:** agent-config — Change #6
**Date:** 2026-03-22
**Status:** Proposed

---

## Problem

The `checkLlmConfig()` function in `packages/cli/src/validator/validate.ts` (lines 119-145) contains hardcoded per-agent conditional branches:

```typescript
const hasPi = agent.runtimes.includes("pi-coding-agent");
if (hasPi && !hasLlm) { /* error */ }
const hasClaude = agent.runtimes.includes("claude-code-agent");
if (hasClaude && hasLlm) { /* warning */ }
```

Adding any new agent that has validation rules requires editing CLI source code. This violates PRD goal G-5 (Agent-agnostic CLI) and the design principle "Agent-SDK as the single contract."

The `AgentPackage.validate` function was added in Change #1 and pi-coding-agent's `validate` was implemented in Change #4, but the CLI validator still uses the hardcoded branches instead of delegating to them.

## Goal

Replace the hardcoded `checkLlmConfig()` body with a delegation loop that calls `AgentPackage.validate()` for each registered agent matching the `ResolvedAgent`'s runtimes. After this change:

1. No agent-specific `if` branches remain in `validate.ts`
2. Pi-coding-agent validation comes from `piCodingAgent.validate()`
3. Claude-code-agent gets a new `validate()` that warns when `agent.llm` is set
4. Adding validation rules for a new agent requires only implementing `validate()` on its `AgentPackage` — no CLI changes needed

## Approach

1. **Add `validate` to claude-code-agent** — Implement a `validate` function on the claude-code-agent `AgentPackage` that warns when `agent.llm` is set (since Claude Code only uses Anthropic).

2. **Refactor `checkLlmConfig()` to `checkAgentValidation()`** — Replace the hardcoded body with a loop: for each runtime in `agent.runtimes`, look up the `AgentPackage` from the registry and call its `validate()` if present. Merge returned errors and warnings into the validator's collections.

3. **Pass agent registry to `validateAgent()`** — The validator needs access to the agent registry to look up `AgentPackage` instances by runtime name. Change the signature to accept an optional registry parameter (defaulting to the global registry for backward compatibility).

4. **Update tests** — Existing tests assert the same error/warning messages. Update them to work with the delegated approach (providing mock agent packages or using the real registry).

## Scope

**In scope:**
- `validate` function on `claude-code-agent` `AgentPackage`
- Refactor `checkLlmConfig()` in `packages/cli/src/validator/validate.ts`
- Pass registry into `validateAgent()` for agent package lookup
- Update existing tests in `packages/cli/tests/validator/validate.test.ts`

**Out of scope:**
- MCP agent validation (no validation rules needed currently)
- Changes to the `AgentPackage.validate` type signature
- New validation categories beyond what already exists

## Risks

- **Registry dependency in validator** — The validator currently has no dependency on the agent registry. Adding one creates a coupling. Mitigated by making the registry parameter optional and using a lightweight lookup interface.
- **Test complexity** — Tests currently don't involve agent packages. They will need to either mock the registry or use real packages. Mitigated by using a simple Map-based registry in tests.
