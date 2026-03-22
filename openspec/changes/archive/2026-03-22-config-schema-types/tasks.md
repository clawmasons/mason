## 1. Config Schema Types

- [x] 1.1 Create `packages/agent-sdk/src/config-schema.ts` with types: `AgentConfigSchema`, `ConfigGroup`, `ConfigField`, `ConfigOption`, `AgentCredentialRequirement`, `AgentValidationError`, `AgentValidationWarning`, `AgentValidationResult`
- [x] 1.2 Export all new types from `packages/agent-sdk/src/index.ts`

## 2. AgentPackage Extension

- [x] 2.1 Add `configSchema?: AgentConfigSchema` to `AgentPackage` interface in `packages/agent-sdk/src/types.ts`
- [x] 2.2 Add `credentialsFn?: (config: Record<string, string>) => AgentCredentialRequirement[]` to `AgentPackage`
- [x] 2.3 Add `dialect?: string` to `AgentPackage`
- [x] 2.4 Add `validate?: (agent: ResolvedAgent) => AgentValidationResult` to `AgentPackage`

## 3. CredentialConfig Extension

- [x] 3.1 Add optional `label?: string` to `CredentialConfig` in `packages/agent-entry/src/index.ts`
- [x] 3.2 Add optional `obtainUrl?: string` to `CredentialConfig`
- [x] 3.3 Add optional `hint?: string` to `CredentialConfig`

## 4. Tests

- [x] 4.1 Create `packages/agent-sdk/tests/config-schema.test.ts` — verify config schema types compile correctly: create `AgentConfigSchema` with groups, fields, static options, dynamic optionsFn
- [x] 4.2 Add test verifying `AgentPackage` with all four new fields compiles and is structurally correct
- [x] 4.3 Add test verifying minimal `AgentPackage` (name + materializer only) still compiles — backward compatibility
- [x] 4.4 Add test verifying `AgentCredentialRequirement` and `AgentValidationResult` types work correctly
- [x] 4.5 Verify `npx tsc --noEmit` passes across the project
- [x] 4.6 Verify `npx vitest run packages/agent-sdk/tests/` passes
