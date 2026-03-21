## Context

Skills are knowledge artifacts (SKILL.md + optional companions like templates, examples, schemas) that provide context to agents. Tasks were recently refactored via `task-agent-sdk-refactor` to introduce a declarative `AgentTaskConfig` driving `readTasks()` and `materializeTasks()`. Skills lack this treatment.

**Current state — two divergent paths:**

1. **Packaged skills** (npm packages) — resolved by `resolveSkill()` in `packages/cli/src/resolver/resolve.ts`. Reads `SkillField` from package.json metadata, producing a `ResolvedSkill` with real `artifacts` and `description`. However, during materialization the actual artifact *content* is never read — `generateSkillReadme()` just creates a synthetic README listing artifact paths.

2. **Local/role-based skills** — adapted by `adaptSkill()` in `packages/shared/src/role/adapter.ts`. Produces a hollow shell: `{ name, version: "0.0.0", artifacts: [], description: skill.name }`. No file content is ever read.

Both paths converge at materialization where `collectAllSkills()` + `generateSkillReadme()` produce synthetic README.md files that list artifact paths without the actual content. There is no `resolveSkillContent()` equivalent to `resolveTaskContent()`.

**Key difference from tasks:** Tasks have per-agent format differences (frontmatter fields, scope encoding, name formats) requiring `AgentTaskConfig` with 5 fields. Skills are static file trees — SKILL.md and companions are copied verbatim regardless of agent. The config is just one field: `projectFolder`.

## Goals / Non-Goals

**Goals:**
- Unify skill handling into a single read/write lifecycle in agent-sdk (mirroring tasks)
- Skills from local roles produce the same quality output as packaged skills
- Replace synthetic README.md generation with direct artifact copying
- Each agent package declares its skill folder via `AgentSkillConfig`
- `resolveSkillContent()` populates ResolvedSkill with actual file content before materialization
- Update docs (skill.md, architecture.md, add-new-agent.md) to document the new pattern

**Non-Goals:**
- Changing the `SkillField` schema or `SKILL.md` format
- Adding per-agent skill transformations (skills are agent-agnostic)
- Modifying the CLI resolver's package-based skill resolution
- Changing how skills are declared in ROLE.md
- Adding skill scoping or frontmatter parsing (skills are simpler than tasks)

## Decisions

### Decision 1: `AgentSkillConfig` is a single-field interface

```typescript
interface AgentSkillConfig {
  /** Folder where skill directories live, relative to workspace root. */
  projectFolder: string;
}
```

**Why not mirror `AgentTaskConfig`'s complexity?** Skills don't vary per agent — no frontmatter, no scope encoding, no name format tokens. The only thing that changes is where the agent expects to find them (`.claude/skills` vs `skills/` vs `.pi/skills`). A single `projectFolder` is sufficient.

**Alternative considered:** Embedding skill config directly in the materializer (status quo). Rejected because it duplicates folder knowledge and prevents generic `readSkills`/`materializeSkills` helpers.

### Decision 2: `ResolvedSkill` gains a `contentMap` field for file content

```typescript
interface ResolvedSkill {
  name: string;
  version: string;
  artifacts: string[];      // relative paths (existing)
  description: string;      // existing
  contentMap?: Map<string, string>;  // NEW: relative-path → file-content
}
```

**Why `contentMap` instead of modifying `artifacts`?** `artifacts` is a list of relative paths declared in package.json — it's a manifest. `contentMap` carries the actual file contents read from disk. Keeping them separate preserves the existing schema contract. The field is optional so the adapter path (`adaptSkill`) can continue returning minimal objects — content is populated later by `resolveSkillContent()`.

**Alternative considered:** A single `content: string` field holding just SKILL.md. Rejected because skills can have multiple artifacts (templates, examples, schemas) that all need to be materialized.

### Decision 3: Content resolution happens in the orchestrator, not the adapter

Following the task pattern, `resolveSkillContent()` lives in `packages/cli/src/materializer/role-materializer.ts` alongside `resolveTaskContent()`. It runs after `adaptRoleToResolvedAgent()` and before `materializeWorkspace()`.

```
Role → adaptRoleToResolvedAgent() → resolveTaskContent() → resolveSkillContent() → materializeWorkspace()
```

**Why not in the adapter?** The adapter is a pure data transformation with no I/O. Skill content resolution requires reading files from disk. Same reasoning as tasks.

**Source location logic mirrors `getSourceProjectDir()`:**
- Local roles: project root is 3 levels up from `role.source.path`
- Packaged roles: `source.path` is the package directory itself

**Source skill folder:** For local roles, skills live in `{projectRoot}/{agentDialect.skills.projectFolder}/{skill-name}/` (using the source agent's config). For packaged roles, skills are in `{packageDir}/skills/{skill-name}/` (the package's bundled skill directory).

### Decision 4: `readSkills()` discovers all files in each skill directory

```typescript
function readSkills(config: AgentSkillConfig, projectDir: string): ResolvedSkill[]
```

Walks `{projectDir}/{config.projectFolder}/`, treating each subdirectory as a skill. For each skill directory:
1. Reads `SKILL.md` — parses frontmatter for `name` and `description`
2. Enumerates all files recursively (SKILL.md + companions)
3. Reads each file's content into `contentMap`
4. Populates `artifacts` from the relative paths

Directories without a `SKILL.md` are skipped (not a valid skill).

### Decision 5: `materializeSkills()` copies the content map

```typescript
function materializeSkills(
  skills: ResolvedSkill[],
  config: AgentSkillConfig,
): MaterializationResult
```

For each skill, writes every entry from `contentMap` to `{config.projectFolder}/{skill-short-name}/{relative-path}`. No transformation — pure file copying via the `MaterializationResult` map.

**This replaces:**
- `generateSkillReadme()` — removed
- `collectAllSkills()` — retained as internal helper, but callers switch to `materializeSkills()`
- Inline skill loops in each materializer

### Decision 6: `collectAllSkills` becomes internal, not exported

`collectAllSkills()` is still useful as a deduplication helper inside `materializeSkills()`, but it no longer needs to be a public SDK export. Materializers call `materializeSkills()` instead of `collectAllSkills()` + `generateSkillReadme()`.

**Migration:** Remove from `agent-sdk/src/index.ts` exports. Keep as a private function in `helpers.ts`.

### Decision 7: Agent packages declare skills config

```typescript
// claude-code-agent/src/index.ts
const claudeCodeAgent: AgentPackage = {
  // ...existing fields...
  skills: {
    projectFolder: ".claude/skills",
  },
};

// pi-coding-agent/src/index.ts
const piCodingAgent: AgentPackage = {
  // ...existing fields...
  skills: {
    projectFolder: "skills",
  },
};
```

The `skills` field on `AgentPackage` is optional (agents that don't support skills omit it). When present, the materializer uses it for `materializeSkills()`.

### Decision 8: Mason canonical skill config for role source resolution

Mirroring `MASON_TASK_CONFIG` in `role-materializer.ts`:

```typescript
const MASON_SKILL_CONFIG: AgentSkillConfig = {
  projectFolder: ".mason/skills",
};
```

Used when `role.source.agentDialect` is `"mason"` or absent.

## Risks / Trade-offs

**[Breaking change] `generateSkillReadme` and `collectAllSkills` removed from public exports** → Any third-party agent packages using these will break. Mitigation: these are internal packages with no external consumers yet. The migration is mechanical — replace the loop with `materializeSkills()`.

**[File size] `contentMap` loads all skill files into memory** → For typical skills (a few markdown files), this is negligible. Risk: a skill with large binary artifacts. Mitigation: skills are text-based knowledge artifacts by design. If needed in future, add a streaming/copy-on-write path, but YAGNI for now.

**[Behaviour change] Real SKILL.md replaces synthetic README.md** → Agents that previously found `README.md` in the skills directory will now find `SKILL.md` (and companions). Claude Code already uses `SKILL.md` path. Pi-coding-agent currently uses `README.md` — its `projectFolder` changes to match. The content is strictly better (real skill content vs. a synthetic list of artifact paths).

**[Adapter hollowness preserved] `adaptSkill` still returns minimal objects** → Content resolution is deferred to the orchestrator. If someone calls `adaptRoleToResolvedAgent` without `resolveSkillContent`, skills will still be hollow. This matches the task pattern — the adapter is pure data, I/O is explicit.

## Open Questions

1. **Should `readSkills` handle binary files (images, schemas)?** Current proposal reads all files as UTF-8 strings via `MaterializationResult` (which is `Map<string, string>`). Binary support would require `Map<string, string | Buffer>`. Propose: defer to a follow-up if needed — current skills are all text.

2. **Should pi-coding-agent's skill folder change from `skills/` to `.pi/skills/`?** Currently pi-coding-agent writes to `skills/{name}/README.md`. The refactor would change this to `skills/{name}/SKILL.md` (+ companions). Should we also move to `.pi/skills/` for consistency with its `.pi/prompts/` convention? Propose: keep `skills/` for now — it's a simpler path and pi-coding-agent doesn't namespace other runtime files.
