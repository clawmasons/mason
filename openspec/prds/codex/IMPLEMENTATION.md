# Codex Agent — Implementation Plan

**PRD:** [openspec/prds/codex/PRD.md](./PRD.md)
**Date:** March 2026
**Phase:** P0

---

## Implementation Steps

---

### CHANGE 1: `buildPromptArgs` Infrastructure — Agent-SDK Print Mode Refactor

Add a `buildPromptArgs` callback to `AgentPackage.printMode` in the shared agent-sdk, replacing the hard-coded `-p` prompt flag. Update `generateAgentLaunchJson` to use the callback with a backward-compatible default. Update existing agents (Claude, Pi) to explicitly define `buildPromptArgs` for clarity.

**PRD refs:** REQ-007 (`buildPromptArgs` Infrastructure Change), PRD §6.1–§6.2

**Summary:** The current `generateAgentLaunchJson` in `packages/agent-sdk/src/helpers.ts` hard-codes `-p` before the initial prompt. Codex CLI uses `codex exec "prompt"` where the prompt is a positional argument — no `-p` flag. Add `buildPromptArgs?: (prompt: string) => string[]` to the `printMode` interface in `packages/agent-sdk/src/types.ts`. Update the helper to call the callback when defined, falling back to `["-p", prompt]` when absent. Update `claude-code-agent` and `pi-coding-agent` to explicitly define `buildPromptArgs: (p) => ["-p", p]` for consistency and self-documentation. Verify all existing agent unit tests and e2e tests continue to pass.

**User Story:** As a developer adding a new agent that uses a different prompt argument convention (positional, `--prompt`, etc.), I define `buildPromptArgs` on my agent's `printMode` config and the shared helper constructs the correct command-line arguments automatically.

**Scope:**
- Modify: `packages/agent-sdk/src/types.ts` — add `buildPromptArgs` to `printMode` interface
- Modify: `packages/agent-sdk/src/helpers.ts` — update `generateAgentLaunchJson` to use callback with fallback
- Modify: `packages/claude-code-agent/src/index.ts` — add explicit `buildPromptArgs: (p) => ["-p", p]`
- Modify: `packages/pi-coding-agent/src/index.ts` — add explicit `buildPromptArgs: (p) => ["-p", p]`
- Update tests: `packages/agent-sdk/tests/` — unit tests for new callback behavior (with callback, without callback, positional args)
- Verify: existing claude-code-agent and pi-coding-agent unit tests pass unchanged

**Testable output:** `generateAgentLaunchJson` with an agent that defines `buildPromptArgs: (p) => [p]` produces args without `-p` flag. Same call with an agent that omits `buildPromptArgs` produces args with `-p` (backward compat). `npx tsc --noEmit` passes. `npx vitest run packages/agent-sdk/tests/` passes. `npx vitest run packages/claude-code-agent/tests/` and `npx vitest run packages/pi-coding-agent/tests/` pass.

**Not Implemented Yet**

---

### CHANGE 2: Codex Agent Package Scaffold — Monorepo Integration

Create the `packages/agents/codex-agent/` package directory structure with `package.json`, TypeScript configs, vitest e2e config, and register the new workspace in the monorepo root. This change sets up the empty package that compiles and is importable, but has no agent logic yet.

**PRD refs:** REQ-009 (Monorepo Integration), PRD §11.1

**Summary:** Create `packages/agents/codex-agent/` with `package.json` (name: `@clawmasons/codex-agent`, dependencies on `@clawmasons/agent-sdk` and `@clawmasons/shared`), `tsconfig.json`, `tsconfig.build.json`, `vitest.e2e.config.ts`. Create stub `src/index.ts` that exports a minimal `AgentPackage` placeholder. Add `"packages/agents/*"` to the root `package.json` workspaces glob. Add `smol-toml` as a dependency for TOML generation. Run `npm install` to wire up the workspace. Verify `npx tsc --noEmit` passes.

**User Story:** As a developer, after this change I can `import codexAgent from "@clawmasons/codex-agent"` in any monorepo package and get a TypeScript-clean, importable package — even though the agent logic isn't implemented yet.

**Scope:**
- New directory: `packages/agents/codex-agent/`
- New file: `packages/agents/codex-agent/package.json`
- New file: `packages/agents/codex-agent/tsconfig.json`
- New file: `packages/agents/codex-agent/tsconfig.build.json`
- New file: `packages/agents/codex-agent/vitest.e2e.config.ts`
- New file: `packages/agents/codex-agent/src/index.ts` — stub AgentPackage export
- Modify: root `package.json` — add `"packages/agents/*"` to workspaces
- Run: `npm install` to link workspace

**Testable output:** `npm install` succeeds. `npx tsc --noEmit` passes. `import codexAgent from "@clawmasons/codex-agent"` resolves in IDE and TypeScript. Package appears in `npm ls @clawmasons/codex-agent`.

**Not Implemented Yet**

---

### CHANGE 3: Codex Materializer — TOML Config & MCP Proxy Configuration

Implement the materializer's `.codex/config.toml` generation with MCP proxy configuration and `auth.json` passthrough. This is the core configuration that enables Codex to connect to the mason MCP proxy.

**PRD refs:** REQ-002 (Codex Materializer — MCP Configuration), PRD §5.2, §5.7

**Summary:** Create `packages/agents/codex-agent/src/materializer.ts` with `materializeHome()` method. Generate `.codex/config.toml` using `smol-toml` containing `[mcp_servers.mason]` with the proxy URL (using `/mcp` for streamable-http or `/sse` for SSE based on proxy type) and `bearer_token_env_var = "MCP_PROXY_TOKEN"`. Conditionally copy `~/.codex/auth.json` from the host into the home materialization output if the file exists — this provides cached authentication so the container doesn't require `OPENAI_API_KEY` if the user has already run `codex auth`. Write unit tests that verify TOML output structure and auth.json conditional copy behavior.

**User Story:** As a mason user running `mason run --agent codex`, the Docker container starts with a `.codex/config.toml` that has the MCP proxy pre-configured. Codex discovers the mason tools automatically through this config. If I've previously run `codex auth` on my host, my auth credentials are carried into the container.

**Scope:**
- New file: `packages/agents/codex-agent/src/materializer.ts` — `materializeHome()` with TOML generation + auth.json copy
- Modify: `packages/agents/codex-agent/package.json` — ensure `smol-toml` dependency
- New test: `packages/agents/codex-agent/tests/materializer.test.ts` — TOML output structure, MCP server entry, auth.json conditional copy

**Testable output:** `materializeHome()` returns a Map containing `.codex/config.toml` with valid TOML. TOML contains `[mcp_servers.mason]` with correct `url` and `bearer_token_env_var`. When `~/.codex/auth.json` exists, it appears in the output map. When it doesn't exist, it's absent. `npx tsc --noEmit` passes. `npx vitest run packages/agents/codex-agent/tests/` passes.

**Not Implemented Yet**

---

### CHANGE 4: Codex Materializer — Task Conversion (Tasks → Prompts)

Implement task conversion from `--source claude` format (`.claude/commands/*.md`) to Codex custom prompts (`~/.codex/prompts/*.md`). Tasks are converted to markdown files with YAML frontmatter and role context.

**PRD refs:** REQ-003 (Codex Materializer — Task Conversion), PRD §5.3

**Summary:** Extend `materializeHome()` in the materializer to generate `~/.codex/prompts/{taskName}.md` files. For each task collected via `collectAllTasks(agent.roles)`, generate a markdown file with: YAML frontmatter (`description` field), role context section (role name, permitted tools), skill references section (pointing to `.agents/skills/` paths), and the task prompt body. MCP tool references in the prompt are rewritten using `mcpNameTemplate` (`${server}_${tool}`). Write unit tests verifying frontmatter structure, role context injection, tool reference rewriting, and skill cross-references.

**User Story:** As a mason user running `mason run --agent codex --source claude --role writer`, the take-notes task from `.claude/commands/take-notes.md` is automatically converted to `~/.codex/prompts/take-notes.md` in the container. The prompt includes role context so Codex knows which tools to use and which skills to reference.

**Scope:**
- Modify: `packages/agents/codex-agent/src/materializer.ts` — extend `materializeHome()` to generate prompt files
- Update tests: `packages/agents/codex-agent/tests/materializer.test.ts` — task conversion tests (frontmatter, role context, tool rewriting, skill refs)

**Testable output:** `materializeHome()` returns Map entries for `.codex/prompts/take-notes.md`. The file has YAML frontmatter with `description`. The body includes role context, MCP tool list with rewritten names, skill references, and the original task prompt. `npx vitest run packages/agents/codex-agent/tests/` passes.

**Not Implemented Yet**

---

### CHANGE 5: Codex Materializer — Skill Conversion & AGENTS.md Generation

Implement skill conversion from mason format to Codex's `.agents/skills/` format and generate the workspace-level `AGENTS.md` with role instructions.

**PRD refs:** REQ-004 (Skill Conversion), REQ-005 (AGENTS.md Generation), PRD §5.4–§5.5

**Summary:** Implement `materializeWorkspace()` in the materializer. For skills: read skills via `collectAllSkills(agent.roles)` and copy each skill's artifacts to `.agents/skills/{skillName}/`. The SKILL.md format is already markdown with YAML frontmatter, so conversion is minimal — primarily a file copy with potential field mapping. For AGENTS.md: generate a workspace-level file with role name, available task references (pointing to `/prompts:<taskName>`), skill references (pointing to `.agents/skills/`), MCP tool list, and usage constraints. Also generate `agent-launch.json` using the shared `generateAgentLaunchJson()` helper.

**User Story:** As Codex running inside the container, I read `AGENTS.md` and immediately know my role, available tasks, skills, and which MCP tools I'm allowed to use. I can reference `.agents/skills/markdown-conventions/` for formatting guidance.

**Scope:**
- Modify: `packages/agents/codex-agent/src/materializer.ts` — implement `materializeWorkspace()` for AGENTS.md, skills, and agent-launch.json
- Update tests: `packages/agents/codex-agent/tests/materializer.test.ts` — AGENTS.md content, skill file copy, agent-launch.json structure

**Testable output:** `materializeWorkspace()` returns Map with `AGENTS.md`, `.agents/skills/markdown-conventions/SKILL.md`, and `agent-launch.json`. AGENTS.md mentions the role, tasks, skills, and MCP tools. Skill files are copied with correct content. `agent-launch.json` has `command: "codex"` and `args` starting with `["exec", "--full-auto"]`. `npx vitest run packages/agents/codex-agent/tests/` passes.

**Not Implemented Yet**

---

### CHANGE 6: Codex AgentPackage Definition & CLI Registration

Complete the `AgentPackage` definition in `index.ts` with all fields (name, aliases, dialect, runtime, dockerfile, printMode, validate, materializer) and register it in the CLI's `BUILTIN_AGENTS` array. This makes `mason run --agent codex` functional.

**PRD refs:** REQ-001 (Codex Agent Package), REQ-006 (Print Mode / JSON Streaming), REQ-009 (Monorepo Integration — CLI registration), PRD §4.1–§4.2, §11.2

**Summary:** Complete `packages/agents/codex-agent/src/index.ts` with the full `AgentPackage` configuration: `name: "codex-agent"`, `aliases: ["codex"]`, `dialect: "codex"`, `dockerfile.installSteps: "RUN npm install -g @openai/codex"`, `runtime: { command: "codex", args: ["exec", "--full-auto"], credentials: [{ key: "OPENAI_API_KEY", type: "env" }] }`, `printMode: { jsonStreamArgs: ["--json"], buildPromptArgs: (p) => [p], parseJsonStreamFinalResult: ... }`, `mcpNameTemplate: "${server}_${tool}"`, and validation that warns if `llm` is set. Register in `packages/cli/src/materializer/role-materializer.ts` by adding to `BUILTIN_AGENTS`. Add `@clawmasons/codex-agent` as a dependency in the CLI's `package.json`.

**Note:** The `parseJsonStreamFinalResult` implementation is a best-guess based on expected NDJSON schema from `codex exec --json`. It will be refined during E2E testing (see CHANGE 7) once actual output is captured. Mark with a TODO.

**User Story:** As a mason user, I run `mason run --agent codex --source claude -p "what is 2+2?"` and mason recognizes "codex" as a valid agent, materializes the workspace, builds the Docker container with Codex installed, and runs `codex exec --full-auto --json "what is 2+2?"` inside it.

**Scope:**
- Modify: `packages/agents/codex-agent/src/index.ts` — complete AgentPackage with all fields
- Modify: `packages/cli/src/materializer/role-materializer.ts` — import and add to `BUILTIN_AGENTS`
- Modify: `packages/cli/package.json` — add `@clawmasons/codex-agent` dependency
- Run: `npm install` to link

**Testable output:** `mason run --agent codex --help` shows codex as a valid agent. `getAgentFromRegistry("codex")` returns the codex agent. `getAgentFromRegistry("codex-agent")` also works. `npx tsc --noEmit` passes. `npx eslint src/ tests/` passes. `npx vitest run packages/agents/codex-agent/tests/` passes. `npx vitest run packages/cli/tests/` passes (no regressions).

**Not Implemented Yet**

---

### CHANGE 7: E2E Tests — Codex Agent with `--source claude`

Write the E2E test suite that validates the full codex agent pipeline: materialization, Docker build, `codex exec --json` execution, and MCP tool usage. Tests use the shared `claude-test-project` fixture with `--source claude` and are gated on `OPENAI_API_KEY`.

**PRD refs:** REQ-008 (E2E Tests), PRD §8.1–§8.5

**Summary:** Create `packages/agents/codex-agent/tests/e2e/agent.test.ts`. Use `copyFixtureWorkspace("codex-agent", { fixture: "claude-test-project" })` to set up the workspace. Tests are wrapped in `describe.skipIf(!hasOpenAIKey || !isDockerAvailable())`. Test 1: basic prompt — `mason run --agent codex --source claude --build -p "what is 2+2?"`, verify stdout contains "4", verify session log has NDJSON events. Test 2: MCP tool usage — `mason run --role writer --agent codex --source claude --build -p "use the take-notes task to write test-file.md with 'test-passed'"`, verify `notes/test-file.md` was created. Use `--build` flag to ensure Docker image is built fresh. During this change, capture actual `codex exec --json` output and refine `parseJsonStreamFinalResult` if needed.

**User Story:** As a developer or CI system, I set `OPENAI_API_KEY` and run `npx vitest run --config packages/agents/codex-agent/vitest.e2e.config.ts`. Both tests pass, proving the full pipeline works: Claude-sourced tasks are converted to Codex prompts, MCP proxy connects, and Codex can execute tasks and use tools.

**Scope:**
- New file: `packages/agents/codex-agent/tests/e2e/agent.test.ts` — 2 e2e tests
- Possibly modify: `packages/agents/codex-agent/src/index.ts` — refine `parseJsonStreamFinalResult` based on actual codex NDJSON output
- Verify: `npx vitest run --config packages/agents/codex-agent/vitest.e2e.config.ts` passes with `OPENAI_API_KEY` set, skips without it

**Testable output:** With `OPENAI_API_KEY` set and Docker available: both e2e tests pass. Test 1 verifies stdout answer. Test 2 verifies file creation via MCP. Without `OPENAI_API_KEY`: tests skip gracefully. `parseJsonStreamFinalResult` correctly extracts the final result from actual codex NDJSON output.

**Not Implemented Yet**
