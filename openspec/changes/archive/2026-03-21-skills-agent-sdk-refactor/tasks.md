## 1. Types and Config

- [x] 1.1 Add `contentMap?: Map<string, string>` field to `ResolvedSkill` in `packages/shared/src/types.ts`
- [x] 1.2 Add `AgentSkillConfig` interface (`{ projectFolder: string }`) to `packages/shared/src/types.ts`
- [x] 1.3 Add `skills?: AgentSkillConfig` field to `AgentPackage` interface in `packages/agent-sdk/src/types.ts`

## 2. SDK Helpers

- [x] 2.1 Add `readSkills(config: AgentSkillConfig, projectDir: string): ResolvedSkill[]` to `packages/agent-sdk/src/helpers.ts` — discover skill dirs, read SKILL.md frontmatter, enumerate all files into contentMap
- [x] 2.2 Add `materializeSkills(skills: ResolvedSkill[], config: AgentSkillConfig): MaterializationResult` to `packages/agent-sdk/src/helpers.ts` — write contentMap entries to `{projectFolder}/{shortName}/{path}`
- [x] 2.3 Remove `generateSkillReadme` from `packages/agent-sdk/src/helpers.ts`
- [x] 2.4 Make `collectAllSkills` a non-exported (private) function in `packages/agent-sdk/src/helpers.ts`

## 3. SDK Exports

- [x] 3.1 Update `packages/agent-sdk/src/index.ts` — export `readSkills`, `materializeSkills`, `AgentSkillConfig`; remove `generateSkillReadme` export; remove `collectAllSkills` from public exports
- [x] 3.2 Re-export `AgentSkillConfig` from shared types in the SDK index

## 4. Content Resolution in CLI

- [x] 4.1 Add `MASON_SKILL_CONFIG` constant (`{ projectFolder: ".mason/skills" }`) to `packages/cli/src/materializer/role-materializer.ts`
- [x] 4.2 Add `getSourceSkillConfig(role)` helper (mirrors `getSourceTaskConfig`) in `packages/cli/src/materializer/role-materializer.ts`
- [x] 4.3 Add `resolveSkillContent(agent, role)` function in `packages/cli/src/materializer/role-materializer.ts` — uses `readSkills` to populate `contentMap` on each skill, mirroring `resolveTaskContent` pattern
- [x] 4.4 Call `resolveSkillContent(resolvedAgent, role)` in `materializeForAgent` after `resolveTaskContent`

## 5. Agent Package Configs

- [x] 5.1 Add `skills: { projectFolder: ".claude/skills" }` to claude-code-agent `AgentPackage` in `packages/claude-code-agent/src/index.ts`
- [x] 5.2 Add `skills: { projectFolder: "skills" }` to pi-coding-agent `AgentPackage` in `packages/pi-coding-agent/src/index.ts`

## 6. Materializer Updates

- [x] 6.1 Update claude-code-agent materializer (`packages/claude-code-agent/src/materializer.ts`) — replace `collectAllSkills` + `generateSkillReadme` loop with `materializeSkills(skills, _agentPkg.skills)` call in both `materializeWorkspace` and `materializeSupervisor`
- [x] 6.2 Update pi-coding-agent materializer (`packages/pi-coding-agent/src/materializer.ts`) — replace `collectAllSkills` + `generateSkillReadme` loop with `materializeSkills(skills, _agentPkg.skills)` call
- [x] 6.3 Update skill path references in task slash command generation (if hardcoded `skills/` path exists, use `_agentPkg.skills.projectFolder` instead)

## 7. CLI Re-exports

- [x] 7.1 Update `packages/cli/src/materializer/common.ts` re-exports to match new SDK surface (remove `generateSkillReadme`, add `readSkills`/`materializeSkills` if re-exported)

## 8. Tests

- [x] 8.1 Add unit tests for `readSkills` in `packages/agent-sdk/tests/` — test discovery, frontmatter parsing, contentMap population, missing SKILL.md skip, empty folder
- [x] 8.2 Add unit tests for `materializeSkills` in `packages/agent-sdk/tests/` — test output paths, short name derivation, contentMap copying, skip when no contentMap
- [x] 8.3 Add round-trip test: `materializeSkills` → `readSkills` produces equivalent results
- [x] 8.4 Update claude-code-agent materializer tests to expect skill files via `materializeSkills` output instead of `generateSkillReadme` README.md
- [x] 8.5 Update pi-coding-agent materializer tests to expect skill files via `materializeSkills` output instead of `generateSkillReadme` README.md
- [x] 8.6 Update any tests that import `generateSkillReadme` or public `collectAllSkills` from agent-sdk

## 9. Documentation

- [x] 9.1 Update `docs/skill.md` — document `AgentSkillConfig`, `readSkills`/`materializeSkills` lifecycle, project-folder skill discovery, replace README.md generation references
- [x] 9.2 Update `docs/architecture.md` — add Skill Read/Write Flow section, update Materializer Pattern table
- [x] 9.3 Update `docs/add-new-agent.md` — add Skill Configuration section, update `AgentPackage` example and materializer example

## 10. Verification

- [x] 10.1 Run `npx tsc --noEmit` — ensure all type changes compile
- [x] 10.2 Run `npx eslint src/ tests/` across affected packages
- [x] 10.3 Run unit tests for agent-sdk: `npx vitest run packages/agent-sdk/tests/`
- [x] 10.4 Run unit tests for claude-code-agent: `npx vitest run packages/claude-code-agent/tests/`
- [x] 10.5 Run unit tests for pi-coding-agent: `npx vitest run packages/pi-coding-agent/tests/`
- [x] 10.6 Run unit tests for cli: `npx vitest run packages/cli/tests/`
