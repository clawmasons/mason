## MODIFIED Requirements

### Requirement: Claude Code materializer generates skills directory manifest

For each unique skill across all roles, the materializer SHALL call `materializeSkills(skills, _agentPkg.skills)` to write skill files. Each skill SHALL be materialized as a directory at `{config.projectFolder}/{skill-short-name}/` containing the actual `SKILL.md` and any companion files (templates, examples, schemas) from the skill's `contentMap`.

The materializer SHALL NOT generate synthetic `README.md` files for skills.

#### Scenario: Skill with artifacts materialized via materializeSkills
- **WHEN** skill `@clawmasons/skill-labeling` has `contentMap` containing `SKILL.md`, `examples/example1.md`, and `schemas/labels.json`
- **AND** `_agentPkg.skills.projectFolder` is `".claude/skills"`
- **THEN** the result SHALL contain:
  - Key `.claude/skills/labeling/SKILL.md` with the actual SKILL.md content
  - Key `.claude/skills/labeling/examples/example1.md` with the example content
  - Key `.claude/skills/labeling/schemas/labels.json` with the schema content
- **AND** the result SHALL NOT contain `skills/labeling/README.md`

#### Scenario: Skill materialization uses AgentPackage config
- **WHEN** the claude-code-agent materializer generates skill files
- **THEN** it SHALL use `_agentPkg.skills` as the `AgentSkillConfig` for `materializeSkills`
- **AND** it SHALL NOT use a hardcoded skill folder path

#### Scenario: No skills produces no skill files
- **WHEN** `collectAllSkills` returns an empty map
- **THEN** no skill files SHALL be written to the materialization result

### Requirement: Claude Code materializer generates slash commands from tasks

For each task in each role, the materializer SHALL generate a file at `{agentPkg.tasks.projectFolder}/{task-path}` containing the task content. The "Required Skills" section in slash commands SHALL reference skills at the path defined by `_agentPkg.skills.projectFolder` instead of a hardcoded `skills/` path.

#### Scenario: Task with skills references correct skill path
- **WHEN** a task requires skill `@clawmasons/skill-labeling`
- **AND** `_agentPkg.skills.projectFolder` is `".claude/skills"`
- **THEN** the slash command SHALL include a reference to `.claude/skills/labeling/` in its Required Skills section

### Requirement: Supervisor path resolves skill content

The `docker-generator.ts` supervisor path (`generateRoleDockerBuildDir`) SHALL call both `resolveTaskContent` and `resolveSkillContent` on the `ResolvedAgent` before generating the Dockerfile. This ensures skills have populated `contentMap` data for all materialization paths.

#### Scenario: Supervisor Dockerfile includes resolved skills
- **WHEN** the supervisor path generates a Docker build directory for a role with skills
- **THEN** it SHALL call `resolveSkillContent(resolvedAgent, role)` after `resolveTaskContent(resolvedAgent, role)`
- **AND** the resulting agent SHALL have skills with populated `contentMap`

#### Scenario: Supervisor path imports resolveSkillContent
- **WHEN** `docker-generator.ts` imports from `role-materializer.ts`
- **THEN** it SHALL import `resolveSkillContent` alongside `resolveTaskContent`
