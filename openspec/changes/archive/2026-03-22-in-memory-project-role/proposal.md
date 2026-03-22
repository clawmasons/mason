## Why

When `mason run <agent-type>` is invoked without `--role` and no alias provides a default role, the CLI exits with an error requiring the user to define a role. This blocks the zero-config use case: a developer with a fully configured `.claude/` directory (commands, skills, MCP servers) must author a ROLE.md before running any containerized agent.

The project role feature eliminates this friction by generating an in-memory `Role` object from the project's existing agent directory. No file is written to disk. The generated role feeds into the existing materialization pipeline via `adaptRoleToResolvedAgent()`.

## What Changes

- `packages/cli/src/cli/commands/run-agent.ts`:
  - Replace the "role required" error (lines 622-629) with project role generation when no `--role` is provided and no alias supplies a default role.
  - Add new exported function `generateProjectRole(projectDir, sources, agentType)` that:
    1. Validates source directories exist (exits with clear error if missing)
    2. Calls `scanProject()` filtered to the resolved source dialects
    3. Maps `ScanResult` → `Role` with first-wins deduplication on tasks, skills, and apps
    4. Sets `instructions` to empty string (never modifies agent system prompt)
    5. Adds `container.ignore.paths` for source directories + `.env` (if exists)
  - Update `runAgent()` signature to accept `Role` directly (not just a role name string) so the in-memory role can be passed without disk I/O.
  - Update all mode functions to accept the pre-resolved `Role` when provided.

- `packages/cli/tests/cli/run-agent.test.ts`:
  - Add tests for `generateProjectRole()`:
    - Generates role from single source with tasks, skills, and apps
    - Handles multi-source with first-wins deduplication
    - Errors on missing source directory with correct message
    - Warns but proceeds on empty source directory
    - Adds `.env` to ignore paths when present
    - Sets empty instructions

## Capabilities

### New Capabilities
- `project-role-generation`: Auto-generate an in-memory Role from a project's agent directory, enabling zero-config `mason <agent-type>` invocations.

### Modified Capabilities
- `run-command`: When no `--role` is provided, generates a project role instead of erroring. The `runAgent()` function now accepts either a role name (string) or a pre-resolved Role object.

## Impact

- Modified file: `packages/cli/src/cli/commands/run-agent.ts` (add `generateProjectRole()`, update `createRunAction()` and `runAgent()`)
- Modified file: `packages/cli/tests/cli/run-agent.test.ts` (add project role generation tests)
- No new packages, no breaking changes to existing `--role` flows
- Dependencies: Changes 1 (Docker pre-flight), 3 (`--source` flag), 4 (scanner enhancement) — all merged
