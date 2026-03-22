# Tasks: Delegated Agent Validation

**Spec:** delegated-agent-validation
**PRD:** agent-config — Change #6
**Date:** 2026-03-22
**Status:** Tasks

---

## Task 1: Add `validate` to claude-code-agent

**File:** `packages/claude-code-agent/src/index.ts`

- Import `AgentValidationResult` and `ResolvedAgent` from `@clawmasons/agent-sdk`
- Add `validate` function to the `claudeCodeAgent` object that:
  - Returns a warning when `agent.llm` is set (Claude Code only uses Anthropic)
  - Returns `{ errors: [], warnings: [] }` when `agent.llm` is not set
- Warning message must match current hardcoded message: `Agent "${agent.agentName}" uses runtime "claude-code-agent" with an "llm" configuration. Claude Code only supports Anthropic — the "llm" field will be ignored.`

**Acceptance:** TypeScript compiles. `claudeCodeAgent.validate(mockAgent)` returns expected result.

---

## Task 2: Refactor `checkLlmConfig()` to delegated `checkAgentValidation()`

**File:** `packages/cli/src/validator/validate.ts`

- Import `AgentPackage` and `AgentRegistry` types from `@clawmasons/agent-sdk`
- Remove `checkLlmConfig()` function (lines 119-145)
- Add `checkAgentValidation(agent, errors, warnings, agentRegistry?)` function:
  - If no registry provided, return immediately (no-op for backward compat)
  - Iterate `agent.runtimes`, look up each in the registry
  - Deduplicate by `AgentPackage.name` (use a `Set`)
  - Call `agentPkg.validate(agent)` when present
  - Map `AgentValidationError` → `ValidationError` and `AgentValidationWarning` → `ValidationWarning`
- Update `validateAgent()` signature to accept optional `agentRegistry?: AgentRegistry` parameter
- Replace `checkLlmConfig(agent, errors, warnings)` call with `checkAgentValidation(agent, errors, warnings, agentRegistry)`

**Acceptance:** TypeScript compiles. No hardcoded `hasPi`/`hasClaude` conditionals remain.

---

## Task 3: Update validator exports

**File:** `packages/cli/src/validator/index.ts`

- No changes needed if the export is `export { validateAgent } from "./validate.js"` (already a re-export)
- Verify the updated signature is properly exported

**File:** `packages/cli/src/index.ts`

- Verify `validateAgent` re-export works with the new optional parameter

**Acceptance:** Consuming code can call `validateAgent(agent)` or `validateAgent(agent, registry)`.

---

## Task 4: Update existing tests

**File:** `packages/cli/tests/validator/validate.test.ts`

- Create a mock `AgentRegistry` (`Map<string, AgentPackage>`) containing:
  - `pi-coding-agent` entry pointing to the real `piCodingAgent` package (imported from `@clawmasons/pi-coding-agent`)
  - `claude-code-agent` entry pointing to the real `claudeCodeAgent` package (imported from `@clawmasons/claude-code-agent`)
- Update all `validateAgent(...)` calls in `llm-config` tests to pass the mock registry
- Verify all existing assertions still pass with identical error/warning messages
- Add new tests:
  - Agent with runtime not in registry: no validation errors
  - Agent with no runtimes: no validation errors
  - `validateAgent(agent)` without registry: no agent-specific validation (backward compat)
  - Deduplication: agent with same runtime listed twice, validate called once

**Acceptance:** `npx vitest run packages/cli/tests/` passes. All existing test assertions unchanged.

---

## Task 5: Verify compilation, linting, and all tests

- Run `npx tsc --noEmit` — must pass
- Run `npx eslint src/ tests/` from relevant packages — must pass
- Run `npx vitest run packages/cli/tests/` — must pass
- Run `npx vitest run packages/claude-code-agent/tests/` (if tests exist) — must pass

**Acceptance:** All checks green.
