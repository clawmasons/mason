## Why

Skills materialization currently has two divergent code paths — packaged skills (resolved via `resolveSkill` in the CLI resolver from npm packages) work correctly, while local project skills (declared in ROLE.md and adapted via `adaptSkill`) produce empty shells with `artifacts: []` and no actual content. The root cause: `adaptSkill` in the adapter simply echoes the skill name as the description and returns an empty artifacts array — there is no `readSkills` equivalent to `readTasks` that discovers and parses skill files from an agent's project folder. Additionally, the current `generateSkillReadme` helper produces a synthetic README.md listing artifacts by path rather than copying the actual SKILL.md and companion files, which means even package-sourced skills lose their real content during materialization.

Tasks were recently refactored (see `task-agent-sdk-refactor`) to introduce a declarative `AgentTaskConfig` that drives both reading and writing. Skills need the same treatment — but simpler, because SKILL.md is a static artifact that just needs to be copied rather than parsed/transformed.

## What Changes

- **Add `AgentSkillConfig` to agent-sdk** — a declarative config (analogous to `AgentTaskConfig`) that tells the SDK where skills live in an agent's project folder and where to materialize them. Since SKILL.md content does not vary per agent (unlike tasks which have agent-specific frontmatter), this config is simpler: just a `projectFolder` path (e.g., `.claude/skills`).
- **Add `readSkills(config, projectDir)` to agent-sdk helpers** — discovers skill directories under `{projectDir}/{config.projectFolder}/{skill-name}/`, reads SKILL.md and enumerates all companion files (templates, examples, schemas). Returns `ResolvedSkill[]` with actual artifact content populated.
- **Add `materializeSkills(skills, config)` to agent-sdk helpers** — copies all skill artifacts (SKILL.md + companions) to the agent's materialization output under `{config.projectFolder}/{skill-name}/`. No README.md generation — just file copying.
- **Remove `generateSkillReadme` helper** — **BREAKING**. The synthetic README.md generation is replaced by direct artifact copying. All callers (claude-code-agent, pi-coding-agent, cli materializer re-export) must switch to `materializeSkills`.
- **Add `skills: AgentSkillConfig` to `AgentPackage` interface** — each agent package declares where its skills folder is (e.g., `{ projectFolder: ".claude/skills" }`).
- **Update agent materializers** — replace inline `collectAllSkills` + `generateSkillReadme` loops with a single `materializeSkills()` call driven by `AgentPackage.skills` config.
- **Remove README.md materialization from skills** — **BREAKING**. Skills will no longer produce a synthetic `README.md`. The real `SKILL.md` and companion artifacts are materialized directly.
- **Unify package vs local skill resolution** — ensure the adapter path (`adaptSkill` in shared) and the resolver path (`resolveSkill` in CLI) produce compatible `ResolvedSkill` objects that both carry actual content. Local skills should use `readSkills` to discover content; packaged skills already have content from the package field.
- **Update `docs/skill.md`** — document the new `AgentSkillConfig`, the `readSkills`/`materializeSkills` lifecycle, and how skills are discovered from project folders (not just packages). Update the "How artifacts are delivered" section to reflect direct file copying instead of README.md generation.
- **Update `docs/architecture.md`** — add a "Skill Read/Write Flow" section (mirroring the existing "Task Read/Write Flow") that shows skills being discovered from `{projectFolder}/{skill-name}/` and materialized by copying artifacts. Update the Materializer Pattern table to reflect that skills are now handled via `AgentSkillConfig` rather than ad-hoc `generateSkillReadme` calls.
- **Update `docs/add-new-agent.md`** — add a "Skill Configuration" section (mirroring "Task Configuration") documenting the `skills` field on `AgentPackage` and `AgentSkillConfig`. Update the `AgentPackage` example to include `skills: { projectFolder: ".my-agent/skills" }`. Update the materializer example to show `materializeSkills()` alongside `materializeTasks()`.

## Capabilities

### New Capabilities
- `skill-read-write`: Declarative read/write lifecycle for skills in agent-sdk, mirroring the task-agent-sdk-refactor pattern. Covers `AgentSkillConfig`, `readSkills()`, `materializeSkills()`, and `AgentPackage.skills` integration.

### Modified Capabilities
- `agent-sdk`: SDK helper exports change — `generateSkillReadme` removed, `materializeSkills` and `readSkills` added. `AgentPackage` gains `skills` field.
- `claude-code-materializer`: Skill materialization switches from `generateSkillReadme` loop to `materializeSkills()` call. No more synthetic README.md for skills.

## Impact

- **packages/agent-sdk** — new `AgentSkillConfig` type, new `readSkills`/`materializeSkills` exports, removed `generateSkillReadme`/`collectAllSkills` exports, `AgentPackage` interface extended.
- **packages/claude-code-agent** — `index.ts` gains `skills` config, materializer replaces inline skill loop with `materializeSkills`.
- **packages/pi-coding-agent** — same pattern as claude-code-agent.
- **packages/cli/src/materializer/common.ts** — re-exports updated to match new SDK surface.
- **packages/cli/src/resolver/resolve.ts** — `resolveSkill` may need adjustment if `ResolvedSkill` gains content fields.
- **packages/shared/src/role/adapter.ts** — `adaptSkill` remains minimal (local skills get content via `readSkills` at materialization time, not adaptation time).
- **packages/shared/src/types.ts** — `ResolvedSkill` may gain an optional `content` field for inline artifact data from packages.
- **Test suites** — helpers.test.ts, materializer tests for claude-code and pi-coding agents need updates for new APIs.
- **docs/skill.md** — rewrite "How artifacts are delivered" to describe direct copying via `materializeSkills`, document `AgentSkillConfig`, add project-folder skill discovery.
- **docs/architecture.md** — add Skill Read/Write Flow diagram, update Materializer Pattern table.
- **docs/add-new-agent.md** — add Skill Configuration section, update `AgentPackage` example and materializer example to include skills.
- **No runtime behavior change** — materialized skills will contain the same (or better) content; agents will find skill files in the same locations.
