# Project Role — Implementation Plan

**PRD:** [project-role/PRD.md](./PRD.md)
**Date:** March 2026

---

## Implementation Steps

---

### CHANGE 1: Docker Pre-flight Check

Move `checkDockerCompose()` to the earliest point in the `run` command — before role resolution, scanning, or any materialization work.

Currently `checkDocker()` is called as step 1 inside each mode function (interactive, dev-container). This change hoists it into `createRunAction()` so it runs once, immediately, regardless of mode. ACP mode currently skips this check — it should also fail fast.

**User Story:** As a user without Docker installed, when I run `mason claude`, I get a clear error with installation links within 2 seconds — not a cryptic failure after role resolution completes.

**Key files:**
- `packages/cli/src/cli/commands/run-agent.ts` — `createRunAction()` (hoist check before role resolution at ~line 600), remove duplicate checks from `runAgentInteractiveMode()` (~line 831), `runAgentDevContainerMode()` (~line 1012), and `runAgentAcpMode()` (~line 1287, which currently has no Docker check at all)
- `packages/cli/src/cli/commands/docker-utils.ts` — existing `checkDockerCompose()` utility

**Testable output:** `mason claude` on a machine without Docker exits immediately with a helpful error message and non-zero exit code.

**Implemented** — [proposal](../../changes/archive/2026-03-21-docker-pre-flight-check/proposal.md) | [design](../../changes/archive/2026-03-21-docker-pre-flight-check/design.md) | [tasks](../../changes/archive/2026-03-21-docker-pre-flight-check/tasks.md)

---

### CHANGE 2: Implied Agent Alias Fallthrough

Extend the CLI pre-parse hook so that when a first positional argument doesn't match any known command or configured alias, it checks the agent registry for a matching agent type.

The current pre-parse hook in `commands/index.ts` already checks `isKnownAgentType()` and `readConfigAgentNames()` at lines 57-58. This change ensures the fallthrough is comprehensive: commands → aliases → agent types → error with available options.

**Pre-implementation verification:** Before writing code, confirm that `mason codex` (without alias config) does NOT already work. If it does, this change is verification-only: add a test and document the existing behavior. Check for edge cases such as agent types added via config but not in the built-in registry.

**User Story:** As a user, I can type `mason codex` without configuring an alias — the CLI recognizes `codex` as a registered agent type and rewrites it to `mason run --agent codex`.

**Key files:**
- `packages/cli/src/cli/commands/index.ts` — pre-parse hook (~lines 44-98), add agent registry check after alias check
- `packages/cli/src/cli/commands/run-agent.ts` — `isKnownAgentType()`, `resolveAgentType()` (~lines 86-103)
- `packages/agent-sdk/src/discovery.ts` — `readConfigAgentNames()`, `readConfigAliasNames()`

**Testable output:** `mason codex` works without alias config. Unknown names produce an error listing available commands and agent types.

**Implemented** — [proposal](../../changes/archive/2026-03-21-implied-agent-alias-fallthrough/proposal.md) | [design](../../changes/archive/2026-03-21-implied-agent-alias-fallthrough/design.md) | [tasks](../../changes/archive/2026-03-21-implied-agent-alias-fallthrough/tasks.md)

---

### CHANGE 3: `--source` CLI Flag

Add a repeatable `--source <name>` flag to the `run` command. Values are validated against the dialect registry. When provided, the flag overrides the `sources` field on the resolved role.

The flag accepts any of: `".claude"`, `"claude"`, or full agent name (`"claude-code-agent"`). All forms are normalized to the dialect registry key using `getDialect()`. Invalid values produce an error listing available sources.

This change only adds the flag parsing and source override on existing roles (used with `--role`). Project role generation (using `--source` without `--role`) is handled in Change 5.

**User Story:** As a developer, I can run `mason claude --role developer --source codex` to use my developer role but resolve task/skill content from `.codex/` instead of `.claude/`.

**Key files:**
- `packages/cli/src/cli/commands/run-agent.ts` — add `--source` option (repeatable) to run command definition. Apply `--source` override in `createRunAction()` after role resolution — mutate the resolved role's `sources` field before passing to materialization. `resolveRole()` is unchanged.
- `packages/shared/src/role/dialect-registry.ts` — `getDialect()` / `getAllDialects()` for validation and normalization of source names

**Testable output:** `mason claude --role developer --source codex` loads the developer role but resolves tasks/skills from `.codex/`. Invalid `--source` values produce a clear error listing available sources.

**Not Implemented Yet**

---

### CHANGE 4: Agent-Aware Scanner Enhancement

Enhance the project scanner to use agent task/skill configuration (`AgentTaskConfig`, `AgentSkillConfig`) to determine directory structure for tasks and skills per agent type, rather than hardcoding paths.

The scanner should consult the agent's task config to know:
- Which directory holds tasks (e.g., `.claude/commands/` vs `.mason/tasks/`)
- Whether subdirectories represent scopes or are part of the task name
- If the agent uses kebab-case for scopes, assume no scoped tasks (impossible to distinguish scope boundary from task name)

Also add dialect filtering to `scanProject()` so callers can scan specific source directories rather than all registered dialects.

See PRD §4.3 and the note on line 87 of PRD.md.

**User Story:** As the project role generator, when I scan `.claude/` I use Claude's task config to know that tasks live in `commands/` and subdirectories are scopes. When I scan `.mason/` I use Mason's config to know tasks live in `tasks/` with path-based scoping.

**Key files:**
- `packages/shared/src/mason/scanner.ts` — `scanProject()` (add dialect filter parameter), `scanCommands()` and `scanSkills()` (use agent task/skill config instead of hardcoded paths)
- `packages/agent-sdk/src/discovery.ts` — `readTask()` and `readSkills()` provide task/skill reading; `AgentTaskConfig` and `AgentSkillConfig` types (from `@clawmasons/agent-sdk`) define directory structure per agent
- `packages/shared/src/role/dialect-registry.ts` — expose task/skill config per dialect so the scanner can look up the correct directory names

**Testable output:** `scanProject(projectDir, { dialects: ["claude-code-agent"] })` returns only items from `.claude/`. Task names respect the agent's scoping rules. Unit tests verify scanning with different agent configs.

**Not Implemented Yet**

---

### CHANGE 5: In-Memory Project Role Generation

When `mason run <agent-type>` is invoked without `--role` and no alias provides a default role, generate an in-memory `Role` (ROLE_TYPES) by scanning the source agent directory.

This is the core feature. It:
1. Resolves source directories from `--source` flags (or defaults to agent type)
2. Calls the enhanced scanner (Change 4) filtered to the resolved sources
3. Maps `ScanResult` → `Role` object with discovered tasks, skills, and apps
4. Sets `instructions` to an empty string — the project role must NOT extend or modify the agent's system prompt
5. Adds container.ignore.paths for source directories + `.env` (if exists)
6. Passes the in-memory Role into the existing materialization pipeline via `adaptRoleToResolvedAgent()`

**Error handling** (per PRD §8.3): `generateProjectRole()` must handle:
1. **No source directory:** If the resolved source directory (e.g., `.claude/`) does not exist, exit with: `Error: Source directory ".<source>/" not found in project. Run from a project with agent configuration or specify a different --source.`
2. **Empty source directory:** If the source directory exists but contains no tasks, skills, or MCP servers, warn but proceed with an empty project role.
3. **Invalid `--source` value:** If the value does not match any registered dialect (after normalization), exit with: `Error: Unknown source "<value>". Available sources: claude, codex, aider, mcp, mason.`

**User Story:** As a developer with a `.claude/` directory containing commands, skills, and MCP settings, I run `mason claude` and get a fully configured containerized agent session — no ROLE.md needed.

**Key files:**
- `packages/cli/src/cli/commands/run-agent.ts` — replace the "role required" error (~line 600-609) with project role generation. New function `generateProjectRole(projectDir, sources, agentType)`
- `packages/shared/src/mason/scanner.ts` — `scanProject()` with dialect filter (from Change 4)
- `packages/shared/src/schemas/role-types.ts` — `Role` type used to construct the in-memory object
- `packages/shared/src/role/adapter.ts` — `adaptRoleToResolvedAgent()` bridges to existing pipeline
- `packages/cli/src/materializer/role-materializer.ts` — materialization proceeds normally with the generated role

**Dependencies:** Change 1 (Docker pre-flight hoisted before role resolution), Change 3 (`--source` flag), Change 4 (scanner enhancement)

**Testable output:** `mason claude` in a project with `.claude/commands/` and `.claude/settings.json` starts a containerized agent with all discovered tasks and MCP servers proxied. No ROLE.md file is created on disk.

**Not Implemented Yet**

---

### CHANGE 6: Integration Tests

End-to-end tests verifying the full project role flow:

1. **Zero-config session:** Project with `.claude/commands/` + `.claude/settings.json` → `mason claude` starts agent
2. **Cross-source:** `.claude/` content → `mason codex --source claude` materializes for Codex
3. **Multi-source merge:** `--source claude --source codex` merges with first-wins
4. **Docker check:** Verify early failure when Docker is unavailable
5. **Implied alias:** `mason codex` without alias config routes correctly
6. **Source override with role:** `--role developer --source codex` overrides role sources
7. **Error cases:** Missing source directory, invalid `--source` value, empty source directory

**Key files:**
- `packages/shared/tests/mason/scanner.test.ts` — unit tests for `scanProject()` with dialect filtering, agent-config-aware directory resolution
- `packages/cli/tests/commands/run-agent.test.ts` — unit tests for `generateProjectRole()`, `--source` flag parsing and normalization, error cases from PRD §8.3
- `packages/tests/project-role.test.ts` — e2e tests for the full project role flow (scenarios 1-7 above)

Follow existing test patterns in each directory (describe/it structure, existing test helpers and fixtures).

**Testable output:** All tests pass. `npx vitest run packages/shared/tests/` and `npx vitest run packages/cli/tests/` green.

**Not Implemented Yet**
