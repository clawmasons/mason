## Context

The pam pipeline currently handles: schema validation → package discovery → dependency resolution → graph validation → toolFilter computation → proxy config generation. The next step is materializing runtime-specific workspaces from the resolved agent graph.

The Claude Code materializer is the first `RuntimeMaterializer` implementation. It generates the files Claude Code needs to operate an agent: MCP settings pointing to the proxy, slash commands scoped to roles, an AGENTS.md with role/tool documentation, and skill artifact directories.

The existing `src/generator/` module generates proxy-level artifacts (config.json). The materializer operates at the next layer — runtime workspace generation. It consumes `ResolvedAgent` and `ResolvedRole` types and produces a directory tree.

## Goals / Non-Goals

**Goals:**
- Define a `RuntimeMaterializer` interface that the Claude Code implementation (and future Codex, Aider, etc.) implements
- Generate `.claude/settings.json` with a single pam-proxy MCP server entry
- Generate `.claude/commands/{task-name}.md` slash commands with role context headers
- Generate `AGENTS.md` with agent identity, all roles, and per-role tool declarations
- Generate `skills/{skill-name}/` directory structure (placeholder paths for now — actual file copying requires filesystem access to source packages)
- Generate a `Dockerfile` string for the Claude Code runtime container

**Non-Goals:**
- Codex or other runtime materializers (separate change)
- Docker Compose generation (separate change)
- `pam install` orchestration (separate change)
- Actual file I/O for skill artifact copying (materializer returns content; caller writes files)
- Strict per-role isolation mode (separate change)

## Decisions

### 1. Module location: `src/materializer/`

New top-level module alongside `schemas/`, `resolver/`, `validator/`, `generator/`. Follows existing pattern where each pipeline stage has its own directory with `types.ts`, implementation files, and `index.ts`.

**Alternative:** Nest inside `src/generator/`. Rejected because materializers are a distinct concern from proxy config generation, and multiple materializer implementations will exist.

### 2. Pure functions returning content objects, not writing files

`materializeWorkspace()` returns a `MaterializationResult` — a map of relative paths to string content. The caller (future `pam install`) handles writing to disk. This keeps materializers pure and testable without filesystem mocking.

**Alternative:** Write files directly. Rejected because it couples the materializer to fs operations and makes testing harder.

### 3. Reuse `getAppShortName()` from generator module

The existing `getAppShortName()` function strips scopes and type prefixes. Slash command filenames and AGENTS.md role names need the same logic. Import from `generator/toolfilter.js` rather than duplicating.

### 4. Slash commands: one per task, role determined by walking role→task ownership

Each task belongs to one or more roles. The slash command header includes the role context. If a task appears in multiple roles, include all applicable roles in the header. The task-to-role mapping is derived by iterating roles and checking which tasks they contain.

### 5. Skills directory: relative path entries

Skill artifacts in `ResolvedSkill` are relative paths (e.g., `./SKILL.md`, `./examples/`). The materializer records the expected target path (`skills/{skill-short-name}/{artifact}`) in the result. Actual artifact file content is not available at this stage (would need to read from the skill package's directory), so the materializer creates a manifest of paths.

## Risks / Trade-offs

- **[Skill artifacts are paths, not content]** → The materializer can list expected skill paths but cannot copy actual files without reading source packages. Mitigation: `pam install` will handle the actual file copying; the materializer provides the manifest. For now, tests validate the path structure.
- **[Task prompt content not embedded]** → Task prompts are file paths (e.g., `./prompts/triage.md`). The materializer includes a placeholder reference. Mitigation: `pam install` reads prompt files and substitutes content.
- **[Multi-role tasks]** → A task in multiple roles gets one slash command with all role contexts listed. This could be confusing. Mitigation: The command header clearly states all applicable roles.
