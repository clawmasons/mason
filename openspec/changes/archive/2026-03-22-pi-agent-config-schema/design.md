# Design: Pi-Coding-Agent Config Schema & Credentials

**Spec ID:** pi-agent-config-schema
**Date:** 2026-03-22
**PRD:** agent-config (Change #4)

---

## Overview

This change makes pi-coding-agent the first agent to use the config framework from Changes 1-3. It adds `configSchema`, `credentialsFn`, and `validate` to the pi-coding-agent `AgentPackage` export, and wires the resolved config values into `ResolvedAgent.llm` so the materializer receives valid LLM configuration.

## Detailed Design

### 1. Pi-Coding-Agent Config Schema

Add three new fields to the `AgentPackage` export in `packages/pi-coding-agent/src/index.ts`:

**configSchema**: One group ("llm" / "LLM Settings") with two fields:
- "provider" — static options: OpenRouter, OpenAI, Together (matching PRD Section 4.3)
- "model" — dynamic options via `optionsFn` keyed on the resolved provider value

**credentialsFn**: Maps the resolved `llm.provider` to the corresponding API key env var name using the existing `PROVIDER_ENV_VARS` map from `@clawmasons/agent-sdk`. Returns a single `AgentCredentialRequirement` with `label`, `obtainUrl` (for openrouter), and `hint`.

**validate**: Checks `agent.llm` is defined. Returns an error with category "llm-config" if missing, empty warnings always.

### 2. Wiring Resolved Config to ResolvedAgent.llm

The config resolution flow already runs in `createRunAction()` (run-agent.ts:793-817) and persists values to `.mason/config.json`. The missing piece: the resolved config values are never mapped to `ResolvedAgent.llm`.

**Approach**: After config resolution succeeds in `createRunAction()`, load the full stored config for the agent and derive `llm` from the `llm.provider` and `llm.model` keys. Pass this as a new `llmConfig` property on the options object flowing through to `ensureDockerBuild` -> `generateRoleDockerBuildDir`. After `adaptRoleToResolvedAgent()` creates the resolved agent, set `resolvedAgent.llm = llmConfig`.

The same mutation must happen in:
- `generateRoleDockerBuildDir` (docker-generator.ts:270) — for Docker builds
- `materializeForAgent` (role-materializer.ts:290) — for materialization
- `runAgentInteractiveMode` (run-agent.ts:1165-1166) — for host proxy setup

To keep the change minimal and focused, we pass an optional `llmConfig` through the existing options/deps plumbing. The docker-generator and role-materializer both already accept options objects we can extend.

### 3. Credential Integration

When `credentialsFn` returns a credential requirement (e.g., `OPENROUTER_API_KEY`), the CLI needs to add it to the declared credentials list. The config resolution flow in `createRunAction()` already has access to the agent package. After config resolution, if `agentPkg.credentialsFn` is defined, call it with the resolved flat config map and merge the returned credential keys into the `agentConfigCredentials` list that flows into docker build and materialization.

### 4. Test Coverage

**Unit tests** (`packages/pi-coding-agent/tests/config-schema.test.ts`):
- configSchema structure: correct group keys, field keys, labels
- provider field has static options for openrouter, openai, together
- model optionsFn returns correct options for each provider
- model optionsFn returns empty array for unknown provider (free-text fallback)
- credentialsFn maps each provider to correct env var key
- credentialsFn returns label and obtainUrl for openrouter
- validate returns error when agent.llm is undefined
- validate returns no errors when agent.llm is defined

**Integration** (in existing `packages/cli/tests/config/` tests):
- No additional tests needed here — the resolution engine is already tested in Changes 2-3. The wiring in run-agent.ts is tested via the existing e2e flow.

## Risks and Mitigations

- **Breaking existing tests**: The pi-coding-agent materializer test already expects `agent.llm` to be set on the test fixture. No changes needed there.
- **Backward compatibility**: All new fields on `AgentPackage` are optional. Agents without `configSchema` are unaffected. The `llmConfig` plumbing defaults to `undefined`, preserving existing behavior.

## Dependencies

- Change 1 (config schema types) — provides `AgentConfigSchema`, `AgentCredentialRequirement`, `AgentValidationResult`
- Change 2 (agent config storage) — provides `getAgentConfig`, `saveAgentConfig`
- Change 3 (config resolution engine) — provides `promptConfig`, `resolveConfig`
