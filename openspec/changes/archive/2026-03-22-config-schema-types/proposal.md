## Why

The agent-config PRD (Change #1) introduces a declarative configuration framework so agents can declare their config needs and the CLI can prompt for them at runtime. Before any runtime behavior can be built, the foundational types must exist: `AgentConfigSchema`, `ConfigGroup`, `ConfigField`, `ConfigOption`. The `AgentPackage` interface must also be extended with four new optional fields (`configSchema`, `credentialsFn`, `dialect`, `validate`), and `CredentialConfig` must gain human-readable metadata fields (`label`, `obtainUrl`, `hint`).

Without these types, none of the subsequent changes (config resolution, interactive prompting, Pi agent wiring, dialect self-registration, delegated validation) can be implemented.

## What Changes

- Create new config schema types in `packages/agent-sdk/src/config-schema.ts`: `AgentConfigSchema`, `ConfigGroup`, `ConfigField`, `ConfigOption`
- Extend `AgentPackage` in `packages/agent-sdk/src/types.ts` with four new optional fields: `configSchema`, `credentialsFn`, `dialect`, `validate`
- Extend `CredentialConfig` in `packages/agent-entry/src/index.ts` with three new optional fields: `label`, `obtainUrl`, `hint`
- Export all new types from `packages/agent-sdk/src/index.ts`

## Capabilities

### New Capabilities
- `config-schema-types`: Declarative configuration schema types (`AgentConfigSchema`, `ConfigGroup`, `ConfigField`, `ConfigOption`) that agents use to declare their config requirements

### Modified Capabilities
- `agent-package-interface`: Extended with `configSchema`, `credentialsFn`, `dialect`, and `validate` optional fields
- `credential-config`: Extended with `label`, `obtainUrl`, and `hint` optional fields for human-readable credential guidance

## Impact

- **New file:** `packages/agent-sdk/src/config-schema.ts` — config schema type definitions
- **Modified file:** `packages/agent-sdk/src/types.ts` — `AgentPackage` interface extended
- **Modified file:** `packages/agent-sdk/src/index.ts` — new type exports
- **Modified file:** `packages/agent-entry/src/index.ts` — `CredentialConfig` interface extended
- **New tests:** `packages/agent-sdk/tests/config-schema.test.ts` — type-level tests verifying all new fields compile correctly and are optional
- **Dependencies:** No new npm dependencies. Imports `ResolvedAgent` from `@clawmasons/shared` (already a dependency).
- **Backward compatible:** All new fields are optional. Existing agent packages compile without changes.
