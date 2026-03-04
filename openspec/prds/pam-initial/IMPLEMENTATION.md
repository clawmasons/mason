# Implementation Plan — Packaged Agent Manager (pam)

**PRD:** [openspec/prds/pam-initial/PRD.md](./PRD.md)
**Version:** 0.1.0
**Date:** March 2026

---

## Approach

Each change below produces a concrete, testable artifact. Changes are ordered so that each builds on the last — the dependency graph flows top-to-bottom. Every change references the relevant PRD sections and includes a user story when it clarifies intent.

Tech stack: TypeScript, Node.js, Commander.js (CLI), Zod (schema validation), npm (delegated operations).

---

# Implementation Steps

## CHANGE: Project Bootstrap & Package Schema Types ✅

Set up the TypeScript project with build tooling (tsconfig, vitest, eslint) and define the core `pam` field types and Zod schema validators for all five package types (app, skill, task, role, agent). This is the type foundation everything else builds on.

**References:** PRD §3 (Package Taxonomy), PRD Appendix A (pam Field JSON Schema Reference)

**User Story:** As a pam developer, I can import `@clawforge/pam` schema validators and validate any package.json's `pam` field against the correct type schema, so I know the metadata is well-formed before any runtime operations.

**Testable output:**
- `npm test` passes with unit tests covering all five package type schemas
- Valid PRD example package.json snippets pass validation
- Invalid/missing fields produce clear Zod error messages
- Published types are importable: `import { AppSchema, RoleSchema, ... } from '@clawforge/pam'`

**Implemented:** 2026-03-03
- [Proposal](../../changes/archive/2026-03-03-project-bootstrap-schema-types/proposal.md)
- [Design](../../changes/archive/2026-03-03-project-bootstrap-schema-types/design.md)
- [Tasks](../../changes/archive/2026-03-03-project-bootstrap-schema-types/tasks.md)
- [Specs](../../changes/archive/2026-03-03-project-bootstrap-schema-types/specs/package-schema-validation/spec.md)
- [Main Spec](../../specs/package-schema-validation/spec.md)

---

## CHANGE: pam init — Workspace Scaffolding ✅

Implement the CLI entry point (`bin/pam`) using Commander.js and the `pam init` command. Creates the foundational workspace structure: root package.json with workspaces config, `.pam/` directory with config.json, `.env.example` template, and the type-organized directory layout (apps/, tasks/, skills/, roles/, agents/).

**References:** PRD §5.1 (Command Reference — pam init), PRD §5.2, PRD §4 (Monorepo Structure)

**User Story:** As an agent developer, I can run `pam init` in an empty directory and get a ready-to-use monorepo workspace where I can start creating agent components, so I don't have to manually set up boilerplate.

**Testable output:**
- `pam init` in a temp directory creates the expected file tree matching PRD §5.2
- Root package.json has `"workspaces": ["apps/*", "tasks/*", "skills/*", "roles/*", "agents/*"]`
- `.pam/config.json` and `.env.example` exist with reasonable defaults
- Running `pam init` twice warns that workspace already exists

**Implemented:** 2026-03-03
- [Proposal](../../changes/archive/2026-03-03-pam-init-workspace-scaffolding/proposal.md)
- [Design](../../changes/archive/2026-03-03-pam-init-workspace-scaffolding/design.md)
- [Tasks](../../changes/archive/2026-03-03-pam-init-workspace-scaffolding/tasks.md)
- [Specs: cli-framework](../../changes/archive/2026-03-03-pam-init-workspace-scaffolding/specs/cli-framework/spec.md)
- [Specs: workspace-init](../../changes/archive/2026-03-03-pam-init-workspace-scaffolding/specs/workspace-init/spec.md)
- [Main Spec: cli-framework](../../specs/cli-framework/spec.md)
- [Main Spec: workspace-init](../../specs/workspace-init/spec.md)

---

## CHANGE: Package Discovery & Dependency Graph Resolution ✅

Implement the graph resolver that reads installed npm packages, parses their `pam` fields, and walks the typed dependency graph (agent → roles → tasks → apps + skills) to produce a `ResolvedAgent` data structure. This is the core engine that powers validate, install, and build.

**References:** PRD §3.1 (Dependency Graph), PRD §8 step 2 (Graph resolution)

**User Story:** As pam internals, given an agent package name, I can resolve its complete dependency tree — all roles, their tasks, each task's required apps and skills — into a single flattened `ResolvedAgent` object, so that downstream commands (validate, install, build) can operate on a stable, fully-resolved representation.

**Testable output:**
- Unit tests with fixture package.json files produce correct `ResolvedAgent` structures
- Resolving the PRD's `@clawforge/agent-repo-ops` example yields 2 roles, their tasks, apps, and skills
- Circular dependency detection throws a clear error for composite task cycles
- Missing dependencies produce actionable error messages (e.g., "task X requires app Y which is not installed")

**Implemented:** 2026-03-03
- [Proposal](../../changes/archive/2026-03-03-package-discovery-dependency-graph/proposal.md)
- [Design](../../changes/archive/2026-03-03-package-discovery-dependency-graph/design.md)
- [Tasks](../../changes/archive/2026-03-03-package-discovery-dependency-graph/tasks.md)
- [Specs: package-discovery](../../changes/archive/2026-03-03-package-discovery-dependency-graph/specs/package-discovery/spec.md)
- [Specs: dependency-graph-resolution](../../changes/archive/2026-03-03-package-discovery-dependency-graph/specs/dependency-graph-resolution/spec.md)
- [Main Spec: package-discovery](../../specs/package-discovery/spec.md)
- [Main Spec: dependency-graph-resolution](../../specs/dependency-graph-resolution/spec.md)

---

## CHANGE: pam validate — Graph Validation ✅

Implement `pam validate <agent>` which runs all validation checks against a resolved agent graph. This is the governance gate that CI/CD pipelines use to catch permission and configuration errors before deployment.

**References:** PRD §5.3 (pam validate), PRD §9.4 (Validation as Governance Gate)

**User Story:** As an agent developer, I can run `pam validate my-agent` and get a pass/fail result with detailed error messages, so I catch permission gaps, missing tools, and misconfigured apps before attempting to install or run anything.

**Testable output:**
- Validates requirement coverage: task's required app tools are in parent role's allow-list
- Validates tool existence: role's allow-list tools exist in app's `pam.tools`
- Validates skill availability: task's required skills are resolvable
- Validates app launch config: stdio apps have command+args, remote apps have url
- Detects circular composite task references (handled by resolver)
- Exit code 0 on valid agent, non-zero with structured error output on invalid
- `--json` flag for machine-readable output

**Implemented:** 2026-03-03
- [Proposal](../../changes/archive/2026-03-03-pam-validate-graph-validation/proposal.md)
- [Design](../../changes/archive/2026-03-03-pam-validate-graph-validation/design.md)
- [Tasks](../../changes/archive/2026-03-03-pam-validate-graph-validation/tasks.md)
- [Specs: graph-validation](../../changes/archive/2026-03-03-pam-validate-graph-validation/specs/graph-validation/spec.md)
- [Main Spec: graph-validation](../../specs/graph-validation/spec.md)

---

## CHANGE: toolFilter Computation & mcp-proxy Config Generation ✅

Implement the toolFilter generation algorithm and the mcp-proxy `config.json` generator. Given a resolved agent, computes the per-app tool allow-list unions across all roles and produces the tbxark/mcp-proxy configuration file.

**References:** PRD §6.3 (tbxark/mcp-proxy Configuration), PRD §6.3.1 (toolFilter Generation Algorithm), PRD §6.3.2 (Proxy Authentication)

**User Story:** As pam install, I can generate a complete mcp-proxy config.json from a resolved agent, so that the proxy enforces the hard governance boundary — only tools explicitly allowed by at least one role are accessible.

**Testable output:**
- Given the PRD's repo-ops agent example, produces config.json matching PRD §6.3 exactly
- toolFilter union is correct: issue-manager + pr-reviewer github tools = `[create_issue, list_repos, add_label, get_pr, create_review]`
- Tools not in any role's allow-list (delete_repo, transfer_repo) are excluded
- Uses `${PAM_PROXY_TOKEN}` placeholder for proxy auth (actual token generated by `pam install`)
- Handles both stdio and remote (sse/streamable-http) app transports
- Environment variable interpolation (`${VAR}`) is preserved in output (resolved at Docker runtime)

**Implemented:** 2026-03-03
- [Proposal](../../changes/archive/2026-03-03-toolfilter-proxy-config/proposal.md)
- [Design](../../changes/archive/2026-03-03-toolfilter-proxy-config/design.md)
- [Tasks](../../changes/archive/2026-03-03-toolfilter-proxy-config/tasks.md)
- [Specs: toolfilter-generation](../../changes/archive/2026-03-03-toolfilter-proxy-config/specs/toolfilter-generation/spec.md)
- [Specs: proxy-config-generation](../../changes/archive/2026-03-03-toolfilter-proxy-config/specs/proxy-config-generation/spec.md)
- [Main Spec: toolfilter-generation](../../specs/toolfilter-generation/spec.md)
- [Main Spec: proxy-config-generation](../../specs/proxy-config-generation/spec.md)

---

## CHANGE: Claude Code Runtime Materializer ✅

Implement the `RuntimeMaterializer` interface and the Claude Code materializer. Generates the workspace directory with `.claude/settings.json` (MCP config pointing to proxy), slash commands from tasks, `AGENTS.md` with role/tool declarations, and the `skills/` directory with materialized skill artifacts.

**References:** PRD §7.1 (Materializer Interface), PRD §7.2 (Claude Code Materializer), PRD §7.2.1–7.2.4

**User Story:** As a Claude Code user, after `pam install`, I want a workspace directory that Claude Code natively understands — with my agent's roles described in AGENTS.md, each task as a slash command scoped to the right role's tools, and skill files available for context — so I can start operating the agent immediately.

**Testable output:**
- Generates `.claude/settings.json` with single pam-proxy MCP server entry matching PRD §7.2.1
- Generates slash commands in `.claude/commands/` with role context headers matching PRD §7.2.2
- Generates `AGENTS.md` with all roles and per-role tool lists matching PRD §7.2.3
- Copies skill artifacts into `skills/{skill-name}/` preserving directory structure
- Generates a Dockerfile for the Claude Code runtime container

**Implemented:** 2026-03-03
- [Proposal](../../changes/archive/2026-03-03-claude-code-materializer/proposal.md)
- [Design](../../changes/archive/2026-03-03-claude-code-materializer/design.md)
- [Tasks](../../changes/archive/2026-03-03-claude-code-materializer/tasks.md)
- [Specs: materializer-interface](../../changes/archive/2026-03-03-claude-code-materializer/specs/materializer-interface/spec.md)
- [Specs: claude-code-materializer](../../changes/archive/2026-03-03-claude-code-materializer/specs/claude-code-materializer/spec.md)
- [Main Spec: materializer-interface](../../specs/materializer-interface/spec.md)
- [Main Spec: claude-code-materializer](../../specs/claude-code-materializer/spec.md)

---

## CHANGE: Docker Compose & Environment Generation ✅

Implement the Docker Compose generator that assembles the `docker-compose.yml` with the mcp-proxy service, one service per declared runtime, the agent-net bridge network, and the `.env` file template. Also generates `pam.lock.json` with the resolved graph snapshot.

**References:** PRD §6.2 (Docker Compose Orchestration), PRD §6.2.3 (Generated docker-compose.yml), PRD §6.4 (Credential Binding)

**User Story:** As an agent operator, after installation I want a single `docker-compose.yml` that I can bring up with `docker compose up` to run the full agent stack — proxy, runtimes, networking — so deployment is one command.

**Testable output:**
- Generated docker-compose.yml matches PRD §6.2.3 structure
- `docker compose config` validates the generated file without errors
- mcp-proxy service has correct volume mount, port mapping, env vars
- Runtime services depend on mcp-proxy, mount workspace, pass correct env vars
- `.env` template lists all required variables with placeholder values
- `pam.lock.json` contains resolved graph with exact versions

**Implemented:** 2026-03-03
- [Proposal](../../changes/archive/2026-03-03-docker-compose-env-generation/proposal.md)
- [Design](../../changes/archive/2026-03-03-docker-compose-env-generation/design.md)
- [Tasks](../../changes/archive/2026-03-03-docker-compose-env-generation/tasks.md)
- [Specs: docker-compose-generation](../../changes/archive/2026-03-03-docker-compose-env-generation/specs/docker-compose-generation/spec.md)
- [Specs: env-generation](../../changes/archive/2026-03-03-docker-compose-env-generation/specs/env-generation/spec.md)
- [Specs: lock-file-generation](../../changes/archive/2026-03-03-docker-compose-env-generation/specs/lock-file-generation/spec.md)
- [Main Spec: docker-compose-generation](../../specs/docker-compose-generation/spec.md)
- [Main Spec: env-generation](../../specs/env-generation/spec.md)
- [Main Spec: lock-file-generation](../../specs/lock-file-generation/spec.md)

---

## CHANGE: pam install — Full Orchestrated Flow ✅

Wire together all preceding components into the `pam install <agent-pkg>` command: npm install → graph resolution → validation → toolFilter computation → proxy config generation → runtime materialization → compose generation → lock file → credential prompting. This is the primary user-facing command.

**References:** PRD §8 (pam install Flow — all 9 steps)

**User Story:** As an agent developer, I can run `pam install @clawforge/agent-repo-ops` and get a complete, ready-to-run scaffolded directory with proxy config, runtime workspaces, docker-compose, and credentials prompting — so I go from package to deployment in one command.

**Testable output:**
- Integration test: `pam install` on a fixture agent package produces the full directory layout from PRD §6.1
- All generated files are present: docker-compose.yml, mcp-proxy/config.json, claude-code/workspace/*, .env, pam.lock.json
- Validation errors abort install with clear messages
- Re-running install updates existing scaffold (idempotent)
- Credential prompting interactively asks for missing env vars (or reads from PAM_ENV_FILE)

**Implemented:** 2026-03-03
- [Proposal](../../changes/archive/2026-03-03-pam-install-orchestrated-flow/proposal.md)
- [Design](../../changes/archive/2026-03-03-pam-install-orchestrated-flow/design.md)
- [Tasks](../../changes/archive/2026-03-03-pam-install-orchestrated-flow/tasks.md)
- [Specs: pam-install-command](../../changes/archive/2026-03-03-pam-install-orchestrated-flow/specs/pam-install-command/spec.md)
- [Main Spec: pam-install-command](../../specs/pam-install-command/spec.md)

**Notes:** npm install delegation and interactive credential prompting are deferred to future changes. The command currently assumes packages are already in the workspace. Unknown runtimes are warned and skipped rather than failing.

---

## CHANGE: pam build, list, and permissions Commands ✅

Implement the remaining read-only CLI commands: `pam build <agent>` (resolves graph + produces pam.lock.json without scaffolding), `pam list` (displays installed agents and their role/task/app tree), `pam permissions <agent>` (displays the resolved permission matrix and generated toolFilter).

**References:** PRD §5.1 (Command Reference — build, list, permissions)

**User Story:** As an agent developer, I can run `pam list` to see what's installed, `pam permissions my-agent` to audit exactly which tools each role can access, and `pam build` to lock the dependency graph — so I have full visibility into the agent's configuration before running it.

**Testable output:**
- `pam build` produces pam.lock.json with resolved versions and dependency tree
- `pam list` outputs a tree view: agent → roles → tasks → apps/skills
- `pam permissions` outputs a matrix: role → app → [allowed tools], plus the generated toolFilter
- All commands return non-zero exit codes when no agent is installed or agent not found

**Implemented:** 2026-03-03
- [Proposal](../../changes/archive/2026-03-03-pam-build-list-permissions/proposal.md)
- [Design](../../changes/archive/2026-03-03-pam-build-list-permissions/design.md)
- [Tasks](../../changes/archive/2026-03-03-pam-build-list-permissions/tasks.md)
- [Specs: build-command](../../changes/archive/2026-03-03-pam-build-list-permissions/specs/build-command/spec.md)
- [Specs: list-command](../../changes/archive/2026-03-03-pam-build-list-permissions/specs/list-command/spec.md)
- [Specs: permissions-command](../../changes/archive/2026-03-03-pam-build-list-permissions/specs/permissions-command/spec.md)
- [Main Spec: build-command](../../specs/build-command/spec.md)
- [Main Spec: list-command](../../specs/list-command/spec.md)
- [Main Spec: permissions-command](../../specs/permissions-command/spec.md)

---

## CHANGE: pam run & stop — Docker Lifecycle ✅

Implement `pam run <agent> [--runtime=X]` and `pam stop <agent>`. Run starts the Docker Compose stack (or a single runtime if `--runtime` specified). Stop tears it down. Both delegate to `docker compose` under the hood.

**References:** PRD §5.1 (Command Reference — run, stop), PRD §6.2 (Docker Compose Orchestration)

**User Story:** As an agent operator, I can run `pam run repo-ops` to bring up the proxy and all runtime containers, then `pam stop repo-ops` to tear everything down — so I manage the full agent lifecycle through pam without touching Docker directly.

**Testable output:**
- `pam run` executes `docker compose up -d` in the agent's scaffolded directory
- `pam run --runtime=claude-code` starts only the proxy and claude-code services
- `pam stop` executes `docker compose down` cleanly
- Missing `.env` values produce a clear error before starting Docker
- Exit codes propagate from Docker Compose

**Implemented:** 2026-03-03
- [Proposal](../../changes/archive/2026-03-03-pam-run-stop-docker-lifecycle/proposal.md)
- [Design](../../changes/archive/2026-03-03-pam-run-stop-docker-lifecycle/design.md)
- [Tasks](../../changes/archive/2026-03-03-pam-run-stop-docker-lifecycle/tasks.md)
- [Specs: run-command](../../changes/archive/2026-03-03-pam-run-stop-docker-lifecycle/specs/run-command/spec.md)
- [Specs: stop-command](../../changes/archive/2026-03-03-pam-run-stop-docker-lifecycle/specs/stop-command/spec.md)
- [Main Spec: run-command](../../specs/run-command/spec.md)
- [Main Spec: stop-command](../../specs/stop-command/spec.md)

---

## CHANGE: pam add & remove — Dependency Management ✅

Implement `pam add <pkg>` (wraps `npm install` with pam field validation and type compatibility checking) and `pam remove <pkg>` (wraps `npm uninstall` with dependent package checking).

**References:** PRD §5.1 (Command Reference — add, remove)

**User Story:** As an agent developer, I can run `pam add @clawforge/app-github` to add an app dependency with validation that it's a real pam package, and `pam remove` warns me if other packages depend on it — so the dependency graph stays consistent.

**Testable output:**
- `pam add` with a valid pam package runs npm install and succeeds
- `pam add` with a non-pam package (no `pam` field) rejects with error
- `pam remove` with dependents warns and requires `--force` to proceed
- `pam remove` without dependents runs npm uninstall cleanly

**Implemented:** 2026-03-03
- [Proposal](../../changes/archive/2026-03-03-pam-add-remove/proposal.md)
- [Design](../../changes/archive/2026-03-03-pam-add-remove/design.md)
- [Tasks](../../changes/archive/2026-03-03-pam-add-remove/tasks.md)
- [Specs: add-command](../../changes/archive/2026-03-03-pam-add-remove/specs/add-command/spec.md)
- [Specs: remove-command](../../changes/archive/2026-03-03-pam-add-remove/specs/remove-command/spec.md)
- [Main Spec: add-command](../../specs/add-command/spec.md)
- [Main Spec: remove-command](../../specs/remove-command/spec.md)

---

## CHANGE: pam publish — Registry Publishing

Implement `pam publish` which wraps `npm publish` with pre-publish validation of the `pam` field. Ensures the package is well-formed before it hits the registry.

**References:** PRD §5.1 (Command Reference — publish), PRD §10 (Registry Strategy)

**User Story:** As a package author, I can run `pam publish` and know that my package's pam metadata is validated before it reaches the registry — so consumers can trust that published pam packages are well-formed.

**Testable output:**
- `pam publish --dry-run` validates the pam field and reports pass/fail without publishing
- Invalid pam field blocks publish with clear error
- Valid pam field delegates to `npm publish` with all args forwarded

---

## CHANGE: Codex Runtime Materializer

Implement the Codex materializer following the same `RuntimeMaterializer` interface. Generates `codex.json` (MCP config pointing to proxy), `instructions.md` (agent identity, roles, tool constraints), and the `skills/` directory.

**References:** PRD §7.3 (Codex Materializer)

**User Story:** As an agent developer targeting multiple runtimes, I want `pam install` to also generate a Codex-compatible workspace alongside Claude Code — so the same agent definition works across runtimes without manual configuration.

**Testable output:**
- Generates `codex.json` with MCP server pointing to proxy
- Generates `instructions.md` with role descriptions and tool constraints
- Copies skill artifacts into `skills/` directory
- Generates Dockerfile for Codex runtime container
- Agent with `runtimes: ["claude-code", "codex"]` produces both workspace directories

---

## CHANGE: Strict Per-Role Isolation Mode

Implement the `--strict-roles` flag for `pam install` that scaffolds one mcp-proxy instance per role, each with its own config.json and toolFilter restricted to exactly that role's allow-list. Updates docker-compose generation to include multiple proxy services.

**References:** PRD §6.5 (Strict Per-Role Isolation)

**User Story:** As a security-conscious operator deploying in a regulated environment, I want hard per-role tool isolation at the proxy layer — not just soft LLM-context boundaries — so that no role can access another role's tools even if the LLM misbehaves.

**Testable output:**
- `pam install --strict-roles` generates separate `mcp-proxy-{role-name}/config.json` per role
- Each proxy config's toolFilter contains only that role's allow-list (no union)
- docker-compose.yml has one mcp-proxy service per role, each on a different port
- Runtime workspace MCP settings reference the correct proxy endpoint per role
- Existing non-strict install still works unchanged (backward compatible)
