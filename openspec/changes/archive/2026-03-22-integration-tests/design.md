## Context

This is Change 6 of the project-role PRD. Changes 1-5 implemented Docker pre-flight check, implied agent aliases, `--source` flag, agent-aware scanner, and in-memory project role generation. Each change included its own unit tests. This change adds the e2e test layer to verify the feature works end-to-end via actual CLI invocations.

Existing unit test coverage is already comprehensive:
- `packages/shared/tests/mason-scanner.test.ts`: 27 tests covering dialect filtering, agent-config-aware scanning, MCP servers, skills, commands, system prompts, and graceful handling.
- `packages/cli/tests/cli/run-agent.test.ts`: Tests for `normalizeSourceFlags()`, `generateProjectRole()`, source override with roles, and `--source` flag registration.
- `packages/cli/tests/cli/commands-index.test.ts`: Tests for implied agent alias routing.

## Goals / Non-Goals

**Goals:**
- Add e2e tests at `packages/tests/tests/project-role.test.ts` that invoke the `mason` CLI binary
- Test error paths that exit before Docker (invalid source, missing source dir, empty source dir)
- Test Docker pre-flight failure with clear error message
- Test implied alias routing via CLI invocation
- Test project role generation output via CLI (using `--verbose` or error output)
- Create a minimal fixture at `packages/tests/fixtures/project-role/` for the tests

**Non-Goals:**
- Adding more unit tests (existing coverage is comprehensive)
- Testing full Docker agent sessions (prohibitively slow for CI, covered by mcp-proxy-agent e2e test pattern)
- Mocking anything (per e2e test standards)

## Decisions

### D1: Test only CLI inputs/outputs, no mocks

Per `packages/tests/AGENTS.md`: "MUST: JUST run the command line" and "MUST: test inputs/outputs of the command line and artifacts generated." All tests invoke `mason` via `masonExec()` or `masonExecExpectError()` helpers.

### D2: Use error-path tests for most scenarios

The project role error paths (invalid `--source`, missing source directory, empty source directory) exit with clear error messages before any Docker interaction. These tests are fast, reliable, and don't require Docker.

### D3: Guard Docker-dependent tests with isDockerAvailable()

Tests that would need Docker to proceed past the pre-flight check (zero-config session, cross-source, multi-source merge) guard with `isDockerAvailable()` and skip when Docker is not present. Even with Docker available, these tests verify the CLI accepts the input and reaches the Docker phase — they do not wait for full agent startup.

### D4: Minimal fixture

Create `packages/tests/fixtures/project-role/` with:
- `.claude/commands/review.md` — a command file
- `.claude/skills/testing/SKILL.md` — a skill
- `.claude/settings.json` — an MCP server declaration
- `.codex/instructions/setup.md` — a codex command (for cross-source tests)
- `package.json` — minimal package

No `.mason/config.json` needed — the CLI auto-creates it via `ensureMasonConfig()`.

## Implementation

### Test file: `packages/tests/tests/project-role.test.ts`

```typescript
describe("project-role: CLI e2e", () => {
  // Scenario 7a: Invalid --source value
  it("rejects invalid --source value with helpful error", () => {
    // mason run --agent claude --source gpt
    // Expected: exit 1, stderr contains "Unknown source" and available list
  });

  // Scenario 7b: Missing source directory
  it("errors when source directory does not exist", () => {
    // In empty workspace (no .claude/), run mason run --agent claude
    // Expected: exit 1, stderr contains "Source directory" not found
  });

  // Scenario 7c: Empty source directory
  it("warns on empty source directory but does not error from source validation", () => {
    // Workspace with empty .claude/ dir, run mason run --agent claude
    // Expected: warning about no tasks/skills/MCP servers (exits later at Docker check)
  });

  // Scenario 4: Docker check
  it("fails with Docker error when Docker is unavailable", () => {
    // Only run when Docker is NOT available
    // mason run --agent claude (with valid .claude/ dir)
    // Expected: exit 1, stderr contains "Docker Compose v2"
  });

  // Scenario 5: Implied alias
  it("routes implied agent alias to run command", () => {
    // In empty workspace: mason codex
    // Expected: exit 1 with source dir error (not "Unknown command")
    // This proves the alias routing worked
  });

  // Scenario 6: Source override with role
  it("accepts --role with --source override", () => {
    // mason run --agent claude --role writer --source codex
    // Expected: reaches Docker check (not a source/role error)
  });

  // Scenarios 1, 2, 3: Only with Docker
  describe("with Docker", () => {
    // Scenario 1: Zero-config session
    it("generates project role from .claude/ directory", () => {
      // mason run --agent claude (with fixture .claude/ dir)
      // Expected: output contains agent startup indicators
    });

    // Scenario 2: Cross-source
    it("uses --source claude content for codex agent", () => {
      // mason run --agent codex --source claude
      // Expected: reaches Docker build phase
    });

    // Scenario 3: Multi-source merge
    it("merges multiple --source flags", () => {
      // mason run --agent claude --source claude --source codex
      // Expected: reaches Docker build phase
    });
  });
});
```

### Test coverage summary

| Scenario | Test Type | Docker Required |
|----------|-----------|----------------|
| 1. Zero-config session | e2e (Docker-guarded) | Yes |
| 2. Cross-source | e2e (Docker-guarded) | Yes |
| 3. Multi-source merge | e2e (Docker-guarded) | Yes |
| 4. Docker check | e2e | No (requires Docker absent) |
| 5. Implied alias | e2e | No |
| 6. Source override with role | e2e | No (fails at Docker) |
| 7a. Invalid source | e2e | No |
| 7b. Missing source dir | e2e | No |
| 7c. Empty source dir | e2e | No |
