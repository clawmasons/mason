## Why

The agent-config PRD (Changes 1-7) added a declarative configuration framework: config schema types, config storage, config resolution engine, Pi agent config schema, dynamic dialect self-registration, delegated agent validation, and removal of legacy hardcoded references. Each change has unit tests, but there are no integration tests that verify these components work together end-to-end.

Without integration tests, regressions in the interplay between config resolution, storage persistence, credential mapping, dialect registration, and delegated validation would go undetected. The IMPLEMENTATION.md explicitly calls for integration and E2E tests as Change #8.

## What Changes

Add comprehensive integration tests that exercise the full agent config flow by testing the public APIs together:

1. **Config resolution + storage round-trip**: resolveConfig with stored values from getAgentConfig/saveAgentConfig
2. **Prompt config with mock prompt function**: full promptConfig flow including optionsFn dependency chains
3. **Non-interactive error reporting**: ConfigResolutionError with structured missing fields
4. **Credential derivation via credentialsFn**: Pi agent's credentialsFn mapping provider to API key
5. **Dialect self-registration verification**: registerAgentDialect from AgentPackage.dialect populates the registry
6. **Delegated validation**: validateAgent using real agent packages (pi-coding-agent, claude-code-agent) through the registry
7. **Config reconfiguration**: delete stored config, re-resolve shows fields as missing again
8. **Third-party agent simulation**: agent loaded with configSchema prompts correctly through the framework

These tests use the real implementations (not mocks of internal functions) but inject mock prompt functions where interactive I/O would be needed. They do NOT require Docker or external services -- they test the config framework's integration, not the full CLI run pipeline.

## Capabilities

### New Capabilities
- `integration-tests-agent-config`: Integration tests verifying config resolution, storage, credential derivation, dialect registration, and delegated validation work together as a cohesive system

### Modified Capabilities
- None

## Impact

- **New file:** `packages/cli/tests/config/integration.test.ts` -- integration tests for config resolution + storage + prompting + credential derivation
- **New file:** `packages/cli/tests/validator/integration.test.ts` -- integration tests for delegated validation with real agent packages
- **New file:** `packages/shared/tests/dialect-integration.test.ts` -- integration tests for dialect self-registration from agent packages
- **New file:** `packages/agent-sdk/tests/config-roundtrip.test.ts` -- integration tests for config storage round-trip with loadConfigAgentEntry
- **Dependencies:** No new npm dependencies. All tests use existing vitest + vi.fn() for prompt injection.
- **Backward compatible:** Test-only changes; no production code modified.
