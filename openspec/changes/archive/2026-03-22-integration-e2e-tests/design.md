## Context

Changes 1-7 of the agent-config PRD built a declarative configuration framework across four packages: `agent-sdk` (types + storage), `shared` (dialect registry), `cli` (config resolution + prompting + validation), and individual agent packages (`pi-coding-agent`, `claude-code-agent`). Each change has focused unit tests, but no tests verify the cross-package integration.

The E2E test infrastructure in `packages/tests/` requires Docker and tests the full CLI spawn pipeline. For Change #8, we need integration tests that verify the config framework components work together without requiring Docker, external services, or interactive TTY. These are *integration* tests (multiple real modules working together) placed in the appropriate package test directories.

## Goals / Non-Goals

**Goals:**
- Verify config resolution + storage + prompting work together as a pipeline
- Verify Pi agent's credentialsFn produces correct credentials based on resolved config
- Verify delegated validation with real agent packages (pi-coding-agent, claude-code-agent) through a real registry
- Verify dialect self-registration from agent packages populates the registry correctly
- Verify config reconfiguration (delete + re-resolve) works
- Verify a simulated third-party agent with configSchema works through the framework
- All tests run without Docker, external services, or TTY

**Non-Goals:**
- Full CLI spawn E2E tests (those require Docker and are in `packages/tests/`)
- Testing interactive readline prompting (covered by unit tests with mock PromptFn)
- Testing `.mason/config.json` file I/O edge cases (covered by existing unit tests)

## Decisions

### 1. Integration tests in package test directories, not e2e

Per the AGENTS.md E2E test standards: "if the test just requires mocks and can run without external calls then add it to (packages/cli/tests)". These integration tests use mock prompt functions and temp directories -- no Docker, no external calls. They belong in the package test directories.

### 2. Test file organization

| Test file | Package | What it tests |
|-----------|---------|---------------|
| `packages/cli/tests/config/integration.test.ts` | cli | Config resolution + storage + prompting pipeline, credentialsFn integration, non-interactive error, reconfiguration, third-party agent simulation |
| `packages/cli/tests/validator/integration.test.ts` | cli | Delegated validation with real Pi and Claude agent packages through a real registry |
| `packages/shared/tests/dialect-integration.test.ts` | shared | Dialect self-registration from agent package metadata, directory lookup, field mapping verification |
| `packages/agent-sdk/tests/config-roundtrip.test.ts` | agent-sdk | Config storage round-trip: saveAgentConfig -> getAgentConfig -> loadConfigAgentEntry consistency |

### 3. Test patterns

- **Mock prompt function**: Use `vi.fn()` returning canned answers keyed by field key. Same pattern as existing `prompt-config.test.ts`.
- **Temp directories**: Use `fs.mkdtempSync` for config storage tests. Clean up in `finally` blocks. Same pattern as existing `agent-config-storage.test.ts`.
- **Real agent packages**: Import `pi-coding-agent` and `claude-code-agent` directly. Build real registries from them.
- **Real resolution functions**: Use `resolveConfig` and `promptConfig` directly, not mocked versions.

## Test Coverage

### A. Config Resolution + Storage Pipeline (`packages/cli/tests/config/integration.test.ts`)

1. **Full pipeline: resolve -> prompt -> save -> re-resolve** -- Start with empty config, prompt all fields, save, then resolve again and verify no missing fields.
2. **Partial config: stored provider, prompt model only** -- Start with partial stored config, verify only missing field is prompted.
3. **optionsFn receives stored values** -- When provider is stored, model's optionsFn should receive it and return provider-specific options.
4. **optionsFn receives prompted values** -- When both fields are missing, prompt provider first, then verify model's optionsFn receives the just-prompted provider.
5. **Non-interactive error with stored partial** -- Partial stored config in non-interactive mode produces ConfigResolutionError listing only the truly missing fields.
6. **credentialsFn integration** -- After config resolution, call Pi's credentialsFn with the resolved flat map and verify correct API key name and metadata.
7. **Config reconfiguration** -- Save full config, delete it, re-resolve shows all fields missing again.
8. **Third-party agent simulation** -- Create a fake AgentPackage with configSchema, run it through the full pipeline.
9. **Default values bypass prompting** -- Schema with defaults resolves fully without any prompting needed.
10. **Multiple groups resolve independently** -- Schema with two groups, stored values in one, prompting in the other.

### B. Delegated Validation Integration (`packages/cli/tests/validator/integration.test.ts`)

1. **Pi agent without LLM -> error from AgentPackage.validate** -- Real pi-coding-agent validate function through real registry.
2. **Pi agent with LLM -> no error** -- Same but with llm set.
3. **Claude agent with LLM -> warning** -- Real claude-code-agent validate warns about ignored llm.
4. **Claude agent without LLM -> clean** -- No warnings.
5. **Mixed runtimes: Pi + Claude without LLM** -- Pi errors, Claude doesn't warn (no llm to warn about).
6. **Mixed runtimes: Pi + Claude with LLM** -- Pi passes, Claude warns.
7. **Registry with config-declared agent** -- Simulated third-party agent with validate function runs through the same path.

### C. Dialect Self-Registration Integration (`packages/shared/tests/dialect-integration.test.ts`)

1. **Pi agent dialect registered** -- After registerAgentDialect with Pi's metadata, getDialect returns correct entry.
2. **Claude agent dialect registered** -- Same for Claude.
3. **Directory lookup works for dynamically registered dialects** -- getDialectByDirectory("pi") returns pi-coding-agent entry.
4. **resolveDialectName works for dynamically registered dialects** -- resolveDialectName("pi") returns "pi-coding-agent".
5. **Task and skill config propagated** -- Dialect entry includes taskConfig and skillConfig from agent package.
6. **Custom dialectFields override defaults** -- Pi's "prompts" tasks field mapping is correctly stored.

### D. Config Storage Round-Trip (`packages/agent-sdk/tests/config-roundtrip.test.ts`)

1. **Save then load via getAgentConfig** -- Standard round-trip.
2. **Save then load via loadConfigAgentEntry** -- Verify config field appears in entry.
3. **Multiple saves with deep merge** -- Save group A, then save group B, verify both present.
4. **Save preserves non-config fields** -- Package, credentials, etc. preserved after config save.
5. **Config deletion and re-save** -- Verify config can be cleared and re-populated.
