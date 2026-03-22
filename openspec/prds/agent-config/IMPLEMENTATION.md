# Agent Configuration Framework — Implementation Plan

**PRD:** [agent-config/PRD.md](./PRD.md)
**Date:** March 2026

---

## Implementation Steps

---

### CHANGE 1: Config Schema Types & AgentPackage Extension

Add the declarative configuration types (`AgentConfigSchema`, `ConfigGroup`, `ConfigField`, `ConfigOption`) to the agent-sdk package and extend `AgentPackage` with the four new optional fields: `configSchema`, `credentialsFn`, `dialect`, and `validate`.

Also extend `CredentialConfig` in `packages/agent-entry/src/index.ts` with `label`, `obtainUrl`, and `hint` fields (PRD §5.1).

This is the foundation — all subsequent changes depend on these types existing.

**User Story:** As an agent package author, I can declare `configSchema`, `credentialsFn`, `dialect`, and `validate` on my `AgentPackage` export and have TypeScript accept it without errors. No runtime behavior changes yet.

**Key files:**
- `packages/agent-sdk/src/types.ts` — Add `configSchema`, `credentialsFn`, `dialect`, `validate` to `AgentPackage` (lines 131-155). Create new types: `AgentConfigSchema`, `ConfigGroup`, `ConfigField`, `ConfigOption` (new section or new file `packages/agent-sdk/src/config-schema.ts`)
- `packages/agent-entry/src/index.ts` — Add optional `label`, `obtainUrl`, `hint` to `CredentialConfig` (lines 27-34)

**Testable output:** `npx tsc --noEmit` passes. A test agent package can declare all four new fields and compile cleanly. Existing agent packages compile without changes (all new fields are optional).

**Not Implemented Yet**

---

### CHANGE 2: Agent Config Storage — Read/Write `.mason/config.json`

Add a `config` field to `AgentEntryConfig` in the existing `agents` section of `.mason/config.json`. This keeps all per-agent state in one place rather than introducing a separate top-level `agentConfig` namespace.

Storage format:
```json
{
  "agents": {
    "pi-coding-agent": {
      "package": "@clawmasons/pi-coding-agent",
      "config": {
        "llm": {
          "provider": "openrouter",
          "model": "anthropic/claude-sonnet-4"
        }
      }
    }
  }
}
```

Implement two new functions:
- `getAgentConfig(projectDir, agentName)` — reads `agents.<agentName>.config`, returns a nested record or empty object
- `saveAgentConfig(projectDir, agentName, config)` — atomically merges the `config` field into the agent's existing entry in `.mason/config.json` (temp file → rename for idempotency per PRD §10.4). Creates the agent entry if it doesn't exist.

**User Story:** As the config resolution flow, I can read and write per-agent config values nested under the agent's existing entry in `.mason/config.json` without corrupting other fields (package, credentials, aliases). Partial writes from Ctrl-C are impossible.

**Key files:**
- `packages/agent-sdk/src/discovery.ts` — Add optional `config?: Record<string, Record<string, string>>` to `AgentEntryConfig` (lines 51-79). Add `getAgentConfig()` and `saveAgentConfig()` functions. Ensure round-trip preserves all existing fields on the agent entry.

**Testable output:** Unit test: `saveAgentConfig(dir, "pi-coding-agent", { llm: { provider: "openrouter", model: "anthropic/claude-sonnet-4" } })` followed by `getAgentConfig(dir, "pi-coding-agent")` returns the same object. Existing agent entry fields (package, credentials, etc.) are preserved. `npx vitest run packages/agent-sdk/tests/` passes.

**Not Implemented Yet**

---

### CHANGE 3: Config Resolution Engine

Implement the core config resolution flow (PRD §6.1): given an `AgentConfigSchema` and stored config, determine which fields are missing, prompt interactively (TTY) or report errors (non-interactive/CI).

This is a pure function at its core — `resolveConfig(schema, storedConfig)` returns `{ resolved: Record<string, string>, missing: ConfigField[] }`. The prompting layer wraps this with `inquirer` (or equivalent) for TTY interaction.

Handles:
- Static `options` and dynamic `optionsFn` for select prompts
- Field resolution in declaration order (so `optionsFn` can depend on prior fields)
- Non-interactive mode: structured error listing all missing fields with labels, hints, and instructions (PRD §6.3)

**User Story:** As a developer running `mason run pi` for the first time without stored config, I see guided prompts for LLM Provider (select list) and Model (dynamic options based on provider). On the second run, prompts are skipped entirely.

**Key files:**
- New file: `packages/cli/src/config/resolve-config.ts` — Pure resolution logic: `resolveConfig(schema, storedConfig)` returns resolved values and missing fields list
- New file: `packages/cli/src/config/prompt-config.ts` — Interactive prompting wrapper using `inquirer`. Injectable prompt function for testability (PRD §10.3). Handles both select-list and free-text input.
- `packages/cli/src/cli/commands/run-agent.ts` — Wire into `createRunAction()` after agent type resolution but before materialization. Load stored config via Change 2, run resolution, persist newly prompted values, then set `agent.llm` from resolved config.

**Testable output:** Unit tests with canned prompt answers verify: (1) all fields prompted when no stored config, (2) no prompts when all values stored, (3) `optionsFn` receives prior field values, (4) non-interactive mode collects missing fields without prompting. `npx vitest run packages/cli/tests/` passes.

**Not Implemented Yet**

---

### CHANGE 4: Pi-Coding-Agent Config Schema & Credentials

Populate the Pi agent package with `configSchema`, `credentialsFn`, and `validate` — making it the first agent to use the framework from Changes 1-3.

The config schema declares one group ("llm") with two fields ("provider" with static options, "model" with `optionsFn` keyed on provider). `credentialsFn` maps provider → API key name with `label` and `obtainUrl`. `validate` checks `agent.llm` is set.

Also wire the stored `config` values into `ResolvedAgent.llm` during the run flow so the materializer receives a populated `llm` field. This replaces the hard error in `packages/pi-coding-agent/src/materializer.ts:27-31` with graceful config resolution.

**User Story:** As a developer, I run `mason run pi` and get prompted for LLM provider and model. After answering, the agent launches successfully. On my next run, it starts immediately with no prompts. The old "requires llm configuration" error never appears.

**Key files:**
- `packages/pi-coding-agent/src/index.ts` (or wherever `AgentPackage` is exported) — Add `configSchema`, `credentialsFn`, `validate` per PRD §4.3 example
- `packages/pi-coding-agent/src/materializer.ts` — Soften error message at lines 27-31 (it becomes a fallback; the framework handles the happy path)
- `packages/cli/src/cli/commands/run-agent.ts` — After config resolution, set `agent.llm = { provider: resolved["llm.provider"], model: resolved["llm.model"] }` before materialization
- `packages/shared/src/role/adapter.ts` — Optionally accept `llm` parameter in `adaptRoleToResolvedAgent()` to populate the field

**Testable output:** `mason run pi` with no stored config prompts for provider/model, persists to `.mason/config.json`, and launches. Second run skips prompts. `npx vitest run packages/pi-coding-agent/tests/` and `npx vitest run packages/cli/tests/` pass.

**Not Implemented Yet**

---

### CHANGE 5: Dynamic Dialect Self-Registration

Replace the hardcoded dialect registry entries (`packages/shared/src/role/dialect-registry.ts:105-214`) with dynamic registration from `AgentPackage.dialect`.

At CLI init time (when `createAgentRegistry()` runs), for each loaded agent that declares a `dialect` field, call `registerDialect()` with the agent's dialect config derived from its `AgentPackage`. The canonical `mason` dialect remains static (it's agent-agnostic).

Also clean up the duplicate pi-coding-agent registration at lines 155-193.

**User Story:** As an agent package author, I set `dialect: "pi"` on my `AgentPackage` and the scanner automatically knows to look in `.pi/` for my agent's content. No changes to the dialect registry source code needed.

**Key files:**
- `packages/shared/src/role/dialect-registry.ts` — Remove hardcoded agent-specific entries (keep `mason`). Add a `registerAgentDialect(agentPkg: AgentPackage)` function that derives dialect config from the agent package's `dialect`, `tasks`, and `skills` fields.
- `packages/cli/src/materializer/role-materializer.ts` — In `createAgentRegistry()` (lines 40-58), after loading `BUILTIN_AGENTS`, call `registerAgentDialect()` for each agent that declares a `dialect` field.
- Agent packages (`pi-coding-agent`, `claude-code-agent`, `mcp-agent`) — Add `dialect` field to their `AgentPackage` exports.

**Testable output:** `getAllDialects()` returns the same dialects as before. Removing a hardcoded dialect entry and adding `dialect` to the corresponding agent package produces identical scanner behavior. `npx vitest run packages/shared/tests/` passes.

**Not Implemented Yet**

---

### CHANGE 6: Delegated Agent Validation

Replace the hardcoded `checkLlmConfig()` branches in `packages/cli/src/validator/validate.ts` (lines 119-145) with delegation to `AgentPackage.validate()`.

The validator iterates all registered agent packages for the current agent's runtimes and calls each one's `validate()` method, merging errors and warnings. Agent-specific `if (hasPi)` / `if (hasClaude)` branches are removed.

Add `validate` to `claude-code-agent` that warns when `agent.llm` is set (Claude doesn't use external LLM config).

**User Story:** As an agent package author, I define validation rules in my package's `validate()` function. The CLI runs them automatically during validation — no CLI code changes needed for new agents.

**Key files:**
- `packages/cli/src/validator/validate.ts` — Replace `checkLlmConfig()` body (lines 119-145) with a loop over registered agents calling `agentPkg.validate(agent)`. Remove `hasPi`/`hasClaude` conditionals.
- `packages/pi-coding-agent/src/index.ts` — `validate` already added in Change 4
- `packages/cli/src/materializer/agents/claude-code-agent/index.ts` (or equivalent) — Add `validate` that warns if `agent.llm` is set

**Testable output:** Validation for Pi agent without LLM config produces the same error as before. Claude agent with LLM config produces the same warning. No agent-specific branches remain in `validate.ts`. `npx vitest run packages/cli/tests/` passes.

**Not Implemented Yet**

---

### CHANGE 7: Remove Legacy Hardcoded References

Clean up the remaining hardcoded agent references that the framework replaces (PRD §7.3, Phase 3):

1. **`AGENT_TYPE_ALIASES` map** in `run-agent.ts:73-79` — Remove; aliases come from `AgentPackage.aliases` (already partially migrated). Add deprecation warning for any leftover alias usage.
2. **`inferAgentType()` default to `"claude-code-agent"`** in `run-agent.ts:51-56` — Make the default configurable via `.mason/config.json` `defaultAgent` field, or error with available agents when ambiguous.
3. **`DEFAULT_MASON_CONFIG`** hardcoded agent defaults — Derive from registered `AgentPackage` defaults.

This is the breaking change phase. Should include a deprecation period where legacy references emit warnings before hard removal.

**User Story:** As a CLI maintainer, I can add new agents by publishing a package with `AgentPackage` — no aliases map, no `inferAgentType()` branch, no validator conditional, no dialect registry entry needed in CLI source.

**Key files:**
- `packages/cli/src/cli/commands/run-agent.ts` — Remove `AGENT_TYPE_ALIASES` (lines 73-79), update `resolveAgentType()` to use agent registry aliases, update `inferAgentType()` to use configurable default
- `packages/cli/src/materializer/role-materializer.ts` — Ensure `createAgentRegistry()` builds alias map from `AgentPackage.aliases`

**Testable output:** `mason run pi` still works (resolved via `AgentPackage.aliases`). `mason run claude` still works. All existing tests pass. `npx vitest run packages/cli/tests/` green.

**Not Implemented Yet**

---

### CHANGE 8: Integration & E2E Tests

End-to-end tests verifying the full agent config flow:

1. **First-run prompting:** `mason run pi` with no stored config → prompts for provider/model → agent launches
2. **Persistent config:** Second `mason run pi` → no prompts, immediate launch
3. **Non-interactive error:** `mason run pi` in CI (no TTY) with missing config → structured error listing missing fields
4. **Credential guidance:** Missing API key → displays label, hint, obtainUrl before prompting
5. **Self-registration:** Agent with `dialect: "pi"` auto-registers in dialect registry
6. **Delegated validation:** Pi without LLM config → error from `AgentPackage.validate()`, not hardcoded branch
7. **Config reconfiguration:** Delete `agentConfig.pi-coding-agent` from config.json → prompts again on next run
8. **Third-party agent:** Agent loaded via `.mason/config.json` `agents` section with `configSchema` → prompts work

**Key files:**
- `packages/cli/tests/config/resolve-config.test.ts` — Unit tests for config resolution engine (pure function tests)
- `packages/cli/tests/config/prompt-config.test.ts` — Unit tests for prompting layer with injectable prompt function
- `packages/agent-sdk/tests/discovery.test.ts` — Unit tests for `getAgentConfig()`/`saveAgentConfig()` round-trip
- `packages/tests/agent-config.test.ts` — E2E tests for scenarios 1-8 above

Follow existing test patterns. Use injectable prompt functions for unit tests; fixture projects for e2e.

**Testable output:** All tests pass. `npx vitest run packages/cli/tests/` and `npx vitest run packages/agent-sdk/tests/` green. E2e: `cd packages/tests && npx vitest run --config vitest.config.ts tests/agent-config.test.ts`.

**Not Implemented Yet**
