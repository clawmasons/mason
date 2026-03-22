# Proposal: Pi-Coding-Agent Config Schema & Credentials

**Spec ID:** pi-agent-config-schema
**Date:** 2026-03-22
**PRD:** agent-config (Change #4)

---

## Problem

The Pi coding agent (`packages/pi-coding-agent`) has no `configSchema`, `credentialsFn`, or `validate` on its `AgentPackage` export. Changes 1-3 built the config framework (types, storage, resolution engine), but no agent uses it yet. As a result:

1. `mason run pi` still fails with a hard error when `agent.llm` is undefined because the materializer throws at `packages/pi-coding-agent/src/materializer.ts:27-31`.
2. There is no way for users to interactively configure the LLM provider and model.
3. The config resolution flow in `run-agent.ts:793-817` runs but never has a schema to resolve against.
4. `ResolvedAgent.llm` is never populated from stored config -- `adaptRoleToResolvedAgent()` does not set it.

## Proposed Change

1. **Add `configSchema` to pi-coding-agent** declaring one group ("llm") with two fields ("provider" with static options, "model" with `optionsFn` keyed on provider), matching PRD Section 4.3.

2. **Add `credentialsFn` to pi-coding-agent** that maps the resolved provider to the corresponding API key name (e.g., openrouter -> OPENROUTER_API_KEY) with `label` and `obtainUrl`.

3. **Add `validate` to pi-coding-agent** that returns an error when `agent.llm` is missing.

4. **Wire resolved config into `ResolvedAgent.llm`** in the run-agent flow. After config resolution completes and new values are persisted, read the resolved config and set `agent.llm = { provider, model }` on the role before docker build / materialization. This is done by passing the resolved LLM config into the adapter or by mutating the resolved agent after adaptation.

5. **Add unit tests** for the pi-coding-agent config schema, credentialsFn, and validate functions.

## Files Affected

- `packages/pi-coding-agent/src/index.ts` — Add `configSchema`, `credentialsFn`, `validate`
- `packages/cli/src/cli/commands/run-agent.ts` — Wire resolved config into `ResolvedAgent.llm`
- `packages/pi-coding-agent/tests/materializer.test.ts` — Extend with config schema tests
- `packages/pi-coding-agent/tests/config-schema.test.ts` — New: unit tests for schema, credentialsFn, validate

## Out of Scope

- Dialect self-registration (Change 5)
- Delegated validation in the CLI validator (Change 6)
- Removing hardcoded references (Change 7)
