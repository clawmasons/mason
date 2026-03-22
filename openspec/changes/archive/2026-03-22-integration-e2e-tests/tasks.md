## 1. Config Resolution + Storage Pipeline Integration Tests

- [x] 1.1 Create `packages/cli/tests/config/integration.test.ts` with test scaffolding (imports, fixtures, helpers)
- [x] 1.2 Test: full pipeline -- resolve with empty config -> prompt all fields -> save -> re-resolve returns all resolved
- [x] 1.3 Test: partial config -- stored provider, prompt model only, verify final resolved map is complete
- [x] 1.4 Test: optionsFn receives stored values from prior fields in group
- [x] 1.5 Test: optionsFn receives just-prompted values when both fields missing
- [x] 1.6 Test: non-interactive error with partial stored config lists only truly missing fields
- [x] 1.7 Test: credentialsFn integration -- resolve config then call Pi's credentialsFn, verify API key name
- [x] 1.8 Test: config reconfiguration -- save config, clear it, re-resolve shows missing
- [x] 1.9 Test: third-party agent simulation -- fake AgentPackage with configSchema through pipeline
- [x] 1.10 Test: default values bypass prompting entirely
- [x] 1.11 Test: multiple groups resolve independently

## 2. Delegated Validation Integration Tests

- [x] 2.1 Create `packages/cli/tests/validator/integration.test.ts` with real agent package imports and registry setup
- [x] 2.2 Test: Pi agent without LLM produces error from AgentPackage.validate
- [x] 2.3 Test: Pi agent with LLM produces no error
- [x] 2.4 Test: Claude agent with LLM produces warning
- [x] 2.5 Test: Claude agent without LLM produces no warning
- [x] 2.6 Test: mixed runtimes Pi + Claude without LLM -- Pi errors, Claude clean
- [x] 2.7 Test: mixed runtimes Pi + Claude with LLM -- Pi passes, Claude warns
- [x] 2.8 Test: simulated third-party agent with validate in registry

## 3. Dialect Self-Registration Integration Tests

- [x] 3.1 Create `packages/shared/tests/dialect-integration.test.ts`
- [x] 3.2 Test: Pi agent dialect registered with correct entry fields
- [x] 3.3 Test: Claude agent dialect registered with correct entry fields
- [x] 3.4 Test: getDialectByDirectory returns dynamically registered dialect
- [x] 3.5 Test: resolveDialectName works for dynamically registered dialects
- [x] 3.6 Test: taskConfig and skillConfig propagated from agent metadata
- [x] 3.7 Test: custom dialectFields override default field mapping

## 4. Config Storage Round-Trip Integration Tests

- [x] 4.1 Create `packages/agent-sdk/tests/config-roundtrip.test.ts`
- [x] 4.2 Test: save then load via getAgentConfig round-trips correctly
- [x] 4.3 Test: save then load via loadConfigAgentEntry includes config field
- [x] 4.4 Test: multiple saves with deep merge preserves all groups
- [x] 4.5 Test: save preserves non-config fields (package, credentials)
- [x] 4.6 Test: config deletion and re-save works cleanly

## 5. Verification

- [x] 5.1 Run `npx tsc --noEmit` -- all packages compile
- [x] 5.2 Run `npx vitest run packages/cli/tests/` -- all CLI tests pass (725 tests, 39 files)
- [x] 5.3 Run `npx vitest run packages/shared/tests/` -- all shared tests pass (262 tests, 12 files)
- [x] 5.4 Run `npx vitest run packages/agent-sdk/tests/` -- all agent-sdk tests pass (175 tests, 6 files)
