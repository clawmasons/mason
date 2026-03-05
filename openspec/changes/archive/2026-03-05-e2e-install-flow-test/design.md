## Context

The forge-packaging PRD (Section 2 — Measurable Outcomes) defines a specific command sequence that must complete without errors:

```
npm run build
npm pack                          # forge tgz
cd forge-core && npm pack         # forge-core tgz
mkdir /tmp/test-forge && cd /tmp/test-forge
npm install <path>/clawforge-forge-0.1.0.tgz
npm install <path>/clawforge-forge-core-0.1.0.tgz
npx forge init --template note-taker
npx forge validate @test-forge/agent-note-taker
npx forge list
npx forge install @test-forge/agent-note-taker
```

Changes 1-5 have implemented all the individual pieces. This test automates and validates the entire pipeline.

## Goals / Non-Goals

**Goals:**
- Automate the PRD's measurable outcome sequence as a vitest integration test
- Validate that pack + install from tgz + init + validate + list + install all compose correctly
- Verify the generated Dockerfile is single-stage (no multi-stage builder)
- Clean up temporary files after tests (pass or fail)

**Non-Goals:**
- Testing Docker image build (requires Docker daemon, not appropriate for CI)
- Testing npm registry publishing
- Testing forge proxy runtime behavior (covered by forge-proxy.test.ts)
- Performance benchmarking

## Decisions

### 1. Use vitest, not shell script
The test is written as a vitest integration test (`tests/integration/install-flow.test.ts`) rather than a shell script. This keeps it in the existing test framework, provides structured assertions, and enables consistent CI integration.

### 2. Build and pack in beforeAll
The `npm run build` and `npm pack` steps run once in `beforeAll` since they are expensive (~10-30 seconds). All test assertions run against the same temp directory.

### 3. Use execFileSync for CLI commands
The test uses `execFileSync` (not shell `exec`) for deterministic, synchronous execution. Each forge command is run via `npx forge <command>` in the temp directory.

### 4. Temp directory naming provides project scope
The temp directory is named `test-forge-<random>` which means:
- The forge init derives project name `test-forge-<random>` from the directory basename
- Local components are scoped as `@test-forge-<random>/*`
- This provides test isolation when running in parallel

### 5. Long timeout for integration test
The test uses a 120-second timeout for the entire suite. The `npm install` steps involving tgz files and `npm install` inside `forge init` are I/O intensive and can take time, especially on CI.

### 6. Verification by assertion, not just exit code
Beyond checking that commands succeed (exit code 0), the test makes specific assertions:
- `forge list --json` output contains the expected agent and its dependencies
- `forge install` output directory contains a Dockerfile without `AS builder`
- The template's package.json was correctly instantiated with the project scope

## Risks / Trade-offs

- **[Risk] Flaky due to npm install timing** -> Mitigated by generous timeout (120s) and running in isolated temp directory.
- **[Risk] Path resolution issues across platforms** -> Mitigated by using `path.join()` and `path.resolve()` throughout.
- **[Trade-off] Test duration** -> This test adds ~30-60 seconds to the test suite. Acceptable for an integration test that validates the core user journey.
- **[Risk] npm pack output filename changes** -> The test uses `npm pack --json` to get the exact filename, avoiding hardcoded version assumptions.
