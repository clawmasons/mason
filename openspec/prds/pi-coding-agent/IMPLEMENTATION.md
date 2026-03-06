# Pi Coding Agent — Implementation Plan

**PRD:** [openspec/prds/pi-coding-agent/PRD.md](./PRD.md)
**Phase:** P0

---

## Implementation Steps

### CHANGE 1: LLM Configuration Schema — Add `llm` Field to Agent Member

Add an optional `llm` field (provider + model) to the agent member schema, resolver, and resolved types. This is the foundational schema change that all subsequent changes depend on.

**PRD refs:** REQ-002 (LLM Configuration Schema), PRD §3.1–§3.2, §7.1

**Summary:** Add a `llmSchema` (object with required `provider: string` and `model: string`) to `src/schemas/member.ts`. Add `llm: llmSchema.optional()` to `agentMemberSchema` (not humanMemberSchema — humans don't have LLM config). Add `llm?: { provider: string; model: string }` to the `ResolvedMember` interface in `src/resolver/types.ts`. Update `resolveMember()` in `src/resolver/resolve.ts` to pass `chapter.llm` into the resolved member when present. Update schema tests and resolver tests to cover the new field.

**User Story:** As a package author, I declare `"llm": { "provider": "openrouter", "model": "anthropic/claude-sonnet-4" }` in my agent member's package.json `chapter` field. The schema validates it, the resolver passes it through, and it's available on `ResolvedMember` for materializers to consume.

**Scope:**
- Modify: `src/schemas/member.ts` — add `llmSchema`, add to `agentMemberSchema`
- Modify: `src/resolver/types.ts` — add `llm?` field to `ResolvedMember`
- Modify: `src/resolver/resolve.ts` — pass `chapter.llm` into resolved member (agent path only)
- Update tests: `tests/schemas/member.test.ts` — schema accepts/rejects llm field correctly
- Update tests: `tests/resolver/resolve.test.ts` — llm field passes through resolution

**Testable output:** Schema validation passes for agent member with `llm: { provider: "openrouter", model: "anthropic/claude-sonnet-4" }`. Schema validation passes for agent member without `llm` (optional). Schema rejects `llm: { provider: "openrouter" }` (missing model). Schema rejects `llm: { model: "..." }` (missing provider). Human member schema rejects `llm` field. Resolver produces `ResolvedMember` with `llm` populated when present. `npx tsc --noEmit` and `npx vitest run` pass.

**Implemented** -- 2026-03-06

**Spec:** [openspec/changes/archive/2026-03-06-llm-configuration-schema/](../../openspec/changes/archive/2026-03-06-llm-configuration-schema/)
- [Proposal](../../openspec/changes/archive/2026-03-06-llm-configuration-schema/proposal.md)
- [Design](../../openspec/changes/archive/2026-03-06-llm-configuration-schema/design.md)
- [Tasks](../../openspec/changes/archive/2026-03-06-llm-configuration-schema/tasks.md)

---

### CHANGE 2: LLM Validation Rules — Pi Requires LLM, Claude Code Warns

Add validation rules that enforce `llm` is required when runtime is `pi-coding-agent` and emit a warning when `llm` is set with `claude-code` runtime.

**PRD refs:** REQ-002 (LLM Configuration Schema — validation acceptance criteria), PRD §3.5

**Summary:** Add a new validation check category (e.g., `"llm-config"`) to the validator in `src/validator/validate.ts`. When `runtimes` includes `"pi-coding-agent"` and `llm` is absent, produce a validation error. When `runtimes` includes `"claude-code"` and `llm` is present, produce a validation warning. Update `src/validator/types.ts` if categories are enumerated. Add tests in `tests/validator/validate.test.ts`.

**User Story:** As a package author, if I declare `runtimes: ["pi-coding-agent"]` without an `llm` field, `chapter validate` tells me I need to specify a provider and model. If I declare `llm` on a `claude-code` member, it warns me the field will be ignored.

**Scope:**
- Modify: `src/validator/types.ts` — add `"llm-config"` to `ValidationErrorCategory`, add `ValidationWarning` and `ValidationWarningCategory` types, add `warnings` to `ValidationResult`
- Modify: `src/validator/validate.ts` — add `checkLlmConfig()` function, call from `validateMember()`
- Modify: `src/validator/index.ts` — export new types
- Modify: `src/index.ts` — re-export new types
- Modify: `src/cli/commands/validate.ts` — display warnings
- Modify: `src/cli/commands/build.ts` — display warnings
- Modify: `src/cli/commands/install.ts` — display warnings
- Update tests: `tests/validator/validate.test.ts` — 8 new tests covering all llm-config validation cases

**Testable output:** `chapter validate @member` with pi-coding-agent runtime and no `llm` shows an error. Same with claude-code runtime and `llm` present shows a warning. `npx tsc --noEmit` and `npx vitest run` pass.

**Implemented** -- 2026-03-06

**Spec:** [openspec/changes/archive/2026-03-06-llm-validation-rules/](../../openspec/changes/archive/2026-03-06-llm-validation-rules/)
- [Proposal](../../openspec/changes/archive/2026-03-06-llm-validation-rules/proposal.md)
- [Design](../../openspec/changes/archive/2026-03-06-llm-validation-rules/design.md)
- [Tasks](../../openspec/changes/archive/2026-03-06-llm-validation-rules/tasks.md)

---

### CHANGE 3: Pi Coding Agent Materializer — Core Workspace Generation

Implement `piCodingAgentMaterializer` satisfying the `RuntimeMaterializer` interface. Generate workspace files: `AGENTS.md`, `.pi/settings.json`, `.pi/extensions/chapter-mcp/` (MCP proxy connection + task command registration via `pi.registerCommand()`), and `skills/` README manifests.

**PRD refs:** REQ-001 (Pi Coding Agent Materializer), PRD §4.2–§4.3

**Summary:** Create `src/materializer/pi-coding-agent.ts`. Extract shared helpers from `claude-code.ts` into a common module (`src/materializer/common.ts`) — `formatPermittedTools()`, `findRolesForTask()`, `collectAllSkills()`, `collectAllTasks()`, `generateAgentsMd()`, `generateSkillReadme()`. The pi materializer's `materializeWorkspace()` generates: `AGENTS.md` (reusing shared helper), `.pi/settings.json` (model from `member.llm`), `.pi/extensions/chapter-mcp/package.json`, `.pi/extensions/chapter-mcp/index.ts` (with `pi.registerMcpServer()` + `pi.registerCommand()` per task), and `skills/{name}/README.md` (reusing shared helper). Create comprehensive unit tests.

**User Story:** As a developer running `chapter install @coder` where coder uses `pi-coding-agent` runtime, the materializer produces a complete workspace directory that pi can load — with MCP proxy connectivity, task commands, and skill documentation all wired up.

**Scope:**
- New file: `src/materializer/common.ts` — extracted shared helpers
- Modify: `src/materializer/claude-code.ts` — import helpers from common instead of local definitions
- New file: `src/materializer/pi-coding-agent.ts` — full materializer implementation
- New test: `tests/materializer/pi-coding-agent.test.ts` — comprehensive tests (workspace files, content validation)
- Update tests: `tests/materializer/claude-code.test.ts` — update imports if helpers moved

**Testable output:** `piCodingAgentMaterializer.materializeWorkspace()` returns Map with keys: `AGENTS.md`, `.pi/settings.json`, `.pi/extensions/chapter-mcp/package.json`, `.pi/extensions/chapter-mcp/index.ts`, `skills/{name}/README.md`. `.pi/settings.json` contains correct model ID. Extension code includes `registerMcpServer()` call with proxy endpoint. Extension code includes `registerCommand()` for each task with role context. `npx tsc --noEmit` and `npx vitest run` pass.

**Implemented** -- 2026-03-06

**Spec:** [openspec/changes/archive/2026-03-06-pi-coding-agent-materializer/](../../openspec/changes/archive/2026-03-06-pi-coding-agent-materializer/)
- [Proposal](../../openspec/changes/archive/2026-03-06-pi-coding-agent-materializer/proposal.md)
- [Design](../../openspec/changes/archive/2026-03-06-pi-coding-agent-materializer/design.md)
- [Tasks](../../openspec/changes/archive/2026-03-06-pi-coding-agent-materializer/tasks.md)

---

### CHANGE 4: Pi Materializer — Dockerfile & Docker Compose Service

Implement `generateDockerfile()` and `generateComposeService()` on the pi materializer. The Dockerfile installs `@mariozechner/pi-coding-agent` and uses `pi --no-session --mode print`. The Compose service includes the LLM provider's env var dynamically based on `member.llm.provider`.

**PRD refs:** REQ-001 (Pi Coding Agent Materializer — Docker portions), PRD §4.4–§4.5

**Summary:** Add `generateDockerfile()` to `piCodingAgentMaterializer` — installs `@mariozechner/pi-coding-agent` globally, CMD is `["pi", "--no-session", "--mode", "print"]`. Add `generateComposeService()` — includes `CHAPTER_ROLES`, `CHAPTER_PROXY_TOKEN`, `CHAPTER_PROXY_ENDPOINT`, and the LLM provider env var (e.g., `OPENROUTER_API_KEY=${OPENROUTER_API_KEY}`). Implement a `PROVIDER_ENV_VARS` mapping from provider ID to env var name. Add tests.

**User Story:** As a DevOps engineer, when `chapter install` scaffolds the Docker stack for a pi-coding-agent member, the Dockerfile and Compose service are correctly configured with the right LLM provider credentials passed through.

**Scope:**
- Modify: `src/materializer/pi-coding-agent.ts` — add `PROVIDER_ENV_VARS` constant, update `generateComposeService()` with LLM provider env var, proxy token, proxy endpoint
- Modify: `src/materializer/index.ts` — re-export `PROVIDER_ENV_VARS`
- Modify: `src/compose/env.ts` — import `PROVIDER_ENV_VARS`, add LLM provider env var to `.env.example` template with deduplication
- Update tests: `tests/materializer/pi-coding-agent.test.ts` — 21 new tests for Compose service env vars and PROVIDER_ENV_VARS constant
- Update tests: `tests/compose/env.test.ts` — 5 new tests for LLM env var in template

**Testable output:** Dockerfile installs `@mariozechner/pi-coding-agent`, CMD is `["pi", "--no-session", "--mode", "print"]`. Compose service includes `OPENROUTER_API_KEY` for openrouter provider, `ANTHROPIC_API_KEY` for anthropic provider, etc. Compose service has correct build path, volumes, networks. `npx tsc --noEmit` and `npx vitest run` pass.

**Implemented** -- 2026-03-06

**Spec:** [openspec/changes/archive/2026-03-06-pi-materializer-docker/](../../openspec/changes/archive/2026-03-06-pi-materializer-docker/)
- [Proposal](../../openspec/changes/archive/2026-03-06-pi-materializer-docker/proposal.md)
- [Design](../../openspec/changes/archive/2026-03-06-pi-materializer-docker/design.md)
- [Tasks](../../openspec/changes/archive/2026-03-06-pi-materializer-docker/tasks.md)

---

### CHANGE 5: Materializer Registry & Install Pipeline Integration

Register `piCodingAgentMaterializer` in the materializer registry and update `.env` generation to include LLM provider env vars.

**PRD refs:** REQ-003 (Materializer Registry), PRD §7.3

**Summary:** Add `piCodingAgentMaterializer` to the `materializerRegistry` Map in `src/cli/commands/install.ts`. The materializer export from `src/materializer/index.ts` and the `.env` LLM provider integration in `src/compose/env.ts` were already completed in Changes 3-4. No changes to `src/compose/docker-compose.ts` were needed since the materializer's `ComposeServiceDef` already includes the LLM env var. Added 11 integration tests for pi-coding-agent and multi-runtime install scenarios.

**User Story:** As a user running `chapter install @coder` where coder has `runtimes: ["pi-coding-agent"]`, the install pipeline finds and invokes the pi materializer automatically. The generated `.env` includes `OPENROUTER_API_KEY=` (or whatever provider is configured).

**Scope:**
- Modify: `src/cli/commands/install.ts` — import `piCodingAgentMaterializer`, add to `materializerRegistry` Map
- Update tests: `tests/cli/install.test.ts` — 11 new tests: pi-coding-agent member installs, workspace files, extension files, .env LLM key, docker-compose service, no .claude artifacts, multi-runtime (claude-code + pi), proxy token baking, settings.json model, success summary

**Testable output:** `chapter install @member-with-pi-runtime` succeeds. `.chapter/members/<slug>/pi-coding-agent/workspace/` directory is scaffolded with all expected files. `.env` includes the LLM provider API key. Docker Compose includes pi-coding-agent service. `npx tsc --noEmit` and `npx vitest run` pass (733 tests, 0 failures).

**Implemented** -- 2026-03-06

**Spec:** [openspec/changes/archive/2026-03-06-materializer-registry-integration/](../../openspec/changes/archive/2026-03-06-materializer-registry-integration/)
- [Proposal](../../openspec/changes/archive/2026-03-06-materializer-registry-integration/proposal.md)
- [Design](../../openspec/changes/archive/2026-03-06-materializer-registry-integration/design.md)
- [Tasks](../../openspec/changes/archive/2026-03-06-materializer-registry-integration/tasks.md)

---

### CHANGE 6: E2E Testing Framework — Package Setup & Scripts

Create the `e2e/` package at the project root with TypeScript, vitest, and setup/teardown scripts for creating and destroying test chapters.

**PRD refs:** REQ-004 (E2E Testing Package), PRD §5.1–§5.5

**Summary:** Create `e2e/` directory with `package.json` (private, type: module, vitest + tsx + dotenv deps, workspace dependency on `@clawmasons/chapter`), `tsconfig.json`, `vitest.config.ts`, `.env.example`. Create `scripts/setup-chapter.ts` — programmatically creates a temp workspace, copies fixture packages, runs `chapter init` and `chapter install` via the chapter package's exported API. Create `scripts/teardown-chapter.ts` — stops Docker Compose, removes temp workspace. Scripts are usable standalone via `npm run setup` / `npm run teardown`. Add `e2e` to root `package.json` workspaces array.

**User Story:** As a developer, I run `cd e2e && npm run setup` to create a fully-materialized test chapter. I can inspect the generated files, manually start the stack, and poke around. When done, `npm run teardown` cleans everything up. The same scripts are called by automated tests.

**Scope:**
- New directory: `e2e/`
- New file: `e2e/package.json`
- New file: `e2e/tsconfig.json`
- New file: `e2e/vitest.config.ts`
- New file: `e2e/.env.example`
- New file: `e2e/.gitignore` — ignore `.env`, `tmp/`
- New file: `e2e/scripts/setup-chapter.ts`
- New file: `e2e/scripts/teardown-chapter.ts`
- Modify: root `package.json` — add `"e2e"` to workspaces array

**Testable output:** `cd e2e && npm install` succeeds. `npm run setup` creates a temp chapter workspace with fixture members installed. The workspace contains `.chapter/members.json`, `.chapter/members/<slug>/` directories. `npm run teardown` removes the workspace. Scripts print clear status messages and paths.

**Not Implemented Yet**

---

### CHANGE 7: E2E Test Fixtures — Note-Taker on Pi + OpenRouter

Create fixture packages for the E2E test: a test member using pi-coding-agent runtime with OpenRouter, reusing chapter-core's role/task/skill stack.

**PRD refs:** REQ-005 (E2E Test — Note-Taker on Pi with OpenRouter), PRD §5.6

**Summary:** Create `e2e/fixtures/test-chapter/` with a workspace-like structure: root `package.json` depending on `@clawmasons/chapter-core`, and `members/test-note-taker/package.json` — an agent member with `runtimes: ["pi-coding-agent"]`, `llm: { provider: "openrouter", model: "anthropic/claude-sonnet-4" }`, and `roles: ["@clawmasons/role-writer"]`. This reuses the existing role-writer → task-take-notes → app-filesystem → skill-markdown-conventions dependency chain from chapter-core, just with pi as the runtime.

**User Story:** As a test author, I have a ready-made fixture that represents a real-world member configuration — the same note-taker functionality but running on pi with OpenRouter. I copy this fixture into a temp workspace and run `chapter install` to get a fully materialized chapter.

**Scope:**
- New directory: `e2e/fixtures/test-chapter/`
- New file: `e2e/fixtures/test-chapter/package.json` — workspace root
- New directory: `e2e/fixtures/test-chapter/members/test-note-taker/`
- New file: `e2e/fixtures/test-chapter/members/test-note-taker/package.json` — pi-coding-agent member

**Testable output:** The fixture `package.json` passes schema validation via `parseChapterField()`. The member declares `pi-coding-agent` runtime, `openrouter` provider, and depends on `@clawmasons/role-writer` from chapter-core. `npm install` in the fixture workspace resolves dependencies successfully.

**Not Implemented Yet**

---

### CHANGE 8: E2E Test — Note-Taker Materialization & Docker Compose Validation

Write the E2E test that validates the note-taker member materialized for pi-coding-agent with OpenRouter — workspace file existence and content, Docker Compose service, and env var configuration.

**PRD refs:** REQ-005 (E2E Test — Note-Taker on Pi with OpenRouter), PRD §5.7

**Summary:** Create `e2e/tests/note-taker-pi.test.ts`. Use setup/teardown to create a temp chapter from fixtures. Tests validate: (1) materialized workspace has all expected pi files (`AGENTS.md`, `.pi/settings.json`, `.pi/extensions/chapter-mcp/index.ts`, `skills/`), (2) `.pi/settings.json` contains correct OpenRouter model ID, (3) extension code registers MCP server and take-notes command, (4) Docker Compose includes pi-coding-agent service with `OPENROUTER_API_KEY` env var, (5) `.env.example` includes `OPENROUTER_API_KEY=`. Tests that require Docker or API keys are gated behind environment checks and skip gracefully.

**User Story:** As a CI system or developer, I run `cd e2e && npm test` and get immediate feedback on whether the pi materializer produces correct output for the note-taker use case. Tests that need live infra skip cleanly when keys/Docker are unavailable.

**Scope:**
- New file: `e2e/tests/note-taker-pi.test.ts` — E2E test suite
- Tests: workspace materialization assertions (always run)
- Tests: Docker Compose generation assertions (always run)
- Tests: proxy connectivity (skip if no Docker)
- Tests: task execution (skip if no OPENROUTER_API_KEY)

**Testable output:** `cd e2e && npm test` passes. Materialization tests verify all expected files exist with correct content. Docker Compose tests verify service definition and env vars. Tests skip gracefully when infrastructure is unavailable. `npx vitest run` in the e2e directory passes.

**Not Implemented Yet**
