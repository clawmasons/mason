# Tasks: Pi-Coding-Agent Config Schema & Credentials

**Spec ID:** pi-agent-config-schema
**Date:** 2026-03-22

---

## Tasks

### T1: Add configSchema, credentialsFn, validate to pi-coding-agent

**File:** `packages/pi-coding-agent/src/index.ts`

- [x] Import `PROVIDER_ENV_VARS` from `@clawmasons/agent-sdk`
- [x] Import `AgentCredentialRequirement`, `AgentValidationResult` types from `@clawmasons/agent-sdk`
- [x] Import `ResolvedAgent` type from `@clawmasons/shared`
- [x] Add `configSchema` with LLM group: provider (static options), model (optionsFn)
- [x] Add `credentialsFn` using PROVIDER_ENV_VARS to map provider -> API key
- [x] Add `validate` that checks agent.llm is defined

### T2: Wire resolved config into ResolvedAgent.llm in run-agent flow

**File:** `packages/cli/src/cli/commands/run-agent.ts`

- [x] Capture `resolved` from promptConfig result
- [x] Derive `llmConfig` from `resolved["llm.provider"]` and `resolved["llm.model"]`
- [x] Call `credentialsFn` with resolved config and collect dynamic credential keys
- [x] Merge dynamic credential keys with static credentials (deduplication)
- [x] Pass `llmConfig` through runAgent -> all three mode functions -> ensureDockerBuild
- [x] Set `resolvedAgent.llm = llmConfig` after adaptRoleFn calls in interactive, devcontainer, and ACP modes

### T3: Set resolvedAgent.llm in docker-generator

**File:** `packages/cli/src/materializer/docker-generator.ts`

- [x] Accept optional `llmConfig` in `GenerateBuildDirOptions`
- [x] After `adaptRoleToResolvedAgent`, set `resolvedAgent.llm = opts.llmConfig` if defined

### T4: Set resolvedAgent.llm in role-materializer and MaterializeOptions

**Files:** `packages/agent-sdk/src/types.ts`, `packages/cli/src/materializer/role-materializer.ts`

- [x] Add optional `llmConfig` to `MaterializeOptions` in agent-sdk
- [x] In `materializeForAgent`, set `resolvedAgent.llm = options.llmConfig` after adapter call

### T5: Unit tests for pi-coding-agent config schema

**File:** `packages/pi-coding-agent/tests/config-schema.test.ts` (new)

- [x] Test configSchema group structure (1 group, 2 fields)
- [x] Test provider field static options (openrouter, openai, together)
- [x] Test model optionsFn for each provider (openrouter, openai, together, unknown)
- [x] Test credentialsFn maps providers to correct env var keys
- [x] Test credentialsFn returns label and obtainUrl for openrouter
- [x] Test validate returns error when agent.llm is undefined
- [x] Test validate returns no errors when agent.llm is defined
- [x] Test validate always returns empty warnings

### T6: Verify existing tests pass

- [x] `npx tsc --noEmit` passes
- [x] `npx eslint` passes on changed files
- [x] `npx vitest run packages/pi-coding-agent/tests/` — 59 tests pass
- [x] `npx vitest run packages/cli/tests/` — 695 tests pass
- [x] `npx vitest run packages/agent-sdk/tests/` — 168 tests pass
- [x] `npx vitest run packages/shared/tests/` — 238 tests pass
