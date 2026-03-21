## Purpose

Provides `readSkills()` and `materializeSkills()` functions that read/write skill files from/to the filesystem using an `AgentSkillConfig`. Mirrors the task-read-write pattern but simpler — skills are static file trees (SKILL.md + companions) copied verbatim without per-agent transformation.

## ADDED Requirements

### Requirement: AgentSkillConfig declares the skill folder location

The system SHALL define an `AgentSkillConfig` interface with a single field:
- `projectFolder: string` — the folder where skill directories live, relative to workspace root (e.g., `".claude/skills"`)

#### Scenario: Config with custom project folder
- **WHEN** an `AgentSkillConfig` is created with `projectFolder: ".claude/skills"`
- **THEN** `readSkills` and `materializeSkills` SHALL use `.claude/skills` as the base directory for skill discovery and output

### Requirement: readSkills discovers skill directories and reads content

The system SHALL provide a `readSkills(config: AgentSkillConfig, projectDir: string): ResolvedSkill[]` function that:
1. Walks `{projectDir}/{config.projectFolder}/`, treating each subdirectory as a skill
2. For each subdirectory containing a `SKILL.md` file:
   - Parses SKILL.md frontmatter for `name` and `description`
   - Enumerates all files recursively (SKILL.md + companions)
   - Reads each file's content into a `contentMap` (`Map<string, string>`, relative-path to file-content)
   - Populates `artifacts` from the relative paths
3. Skips directories without a `SKILL.md`
4. Returns `ResolvedSkill[]`

#### Scenario: Read skill with SKILL.md and companions
- **WHEN** `readSkills` is called with `projectFolder: ".claude/skills"` and `projectDir: "/workspace"`
- **AND** `/workspace/.claude/skills/labeling/` contains `SKILL.md`, `examples/example1.md`, and `schemas/labels.json`
- **THEN** it SHALL return a `ResolvedSkill` with:
  - `name` derived from SKILL.md frontmatter
  - `artifacts` containing `["SKILL.md", "examples/example1.md", "schemas/labels.json"]`
  - `contentMap` mapping each relative path to its file content

#### Scenario: Read skill parses frontmatter for name and description
- **WHEN** `readSkills` encounters a SKILL.md with frontmatter `name: "Issue Labeling"` and `description: "Taxonomy for labels"`
- **THEN** the returned `ResolvedSkill` SHALL have `name: "Issue Labeling"` and `description: "Taxonomy for labels"`

#### Scenario: Directory without SKILL.md is skipped
- **WHEN** `readSkills` is called and a subdirectory exists without a `SKILL.md` file
- **THEN** that directory SHALL be skipped and not included in the returned array

#### Scenario: Empty or missing projectFolder returns empty array
- **WHEN** `readSkills` is called and `{projectDir}/{config.projectFolder}` does not exist or contains no subdirectories
- **THEN** it SHALL return an empty array

### Requirement: ResolvedSkill gains a contentMap field

The `ResolvedSkill` type SHALL include an optional `contentMap?: Map<string, string>` field that maps relative file paths to file contents. This field is populated by `readSkills()` and consumed by `materializeSkills()`.

#### Scenario: contentMap populated by readSkills
- **WHEN** `readSkills` reads a skill directory with `SKILL.md` and `templates/default.md`
- **THEN** the `ResolvedSkill.contentMap` SHALL contain entries for `"SKILL.md"` and `"templates/default.md"` with their file contents as values

#### Scenario: contentMap is optional for backward compatibility
- **WHEN** a `ResolvedSkill` is created without `contentMap` (e.g., by `adaptSkill`)
- **THEN** it SHALL be a valid `ResolvedSkill` with `contentMap` as `undefined`

### Requirement: materializeSkills writes skill files from contentMap

The system SHALL provide a `materializeSkills(skills: ResolvedSkill[], config: AgentSkillConfig): MaterializationResult` function that:
1. For each skill with a `contentMap`, writes every entry to `{config.projectFolder}/{skill-short-name}/{relative-path}`
2. The skill short name SHALL be derived by stripping the package scope and `skill-` prefix (e.g., `@clawmasons/skill-labeling` becomes `labeling`)
3. Returns a `MaterializationResult` (`Map<string, string>`) of relative paths to file content
4. Skills without a `contentMap` (or with an empty `contentMap`) SHALL be skipped

#### Scenario: Materialize skill with multiple artifacts
- **WHEN** `materializeSkills` is called with a skill named `@clawmasons/skill-labeling` having `contentMap` entries for `SKILL.md` and `examples/example1.md`, and `config.projectFolder` is `.claude/skills`
- **THEN** the result SHALL contain:
  - Key `.claude/skills/labeling/SKILL.md` with the SKILL.md content
  - Key `.claude/skills/labeling/examples/example1.md` with the example content

#### Scenario: Materialize skill derives short name
- **WHEN** `materializeSkills` is called with a skill named `@clawmasons/skill-labeling`
- **THEN** the output path SHALL use `labeling` as the skill directory name

#### Scenario: Materialize skill with unscoped name
- **WHEN** `materializeSkills` is called with a skill named `labeling` (no scope or prefix)
- **THEN** the output path SHALL use `labeling` as the skill directory name

#### Scenario: Skill without contentMap is skipped
- **WHEN** `materializeSkills` is called with a skill that has `contentMap: undefined`
- **THEN** no files SHALL be written for that skill

### Requirement: resolveSkillContent populates contentMap from source files

The system SHALL provide a `resolveSkillContent(agent: ResolvedAgent, role: Role): void` function that:
1. Determines the source skill config via `getSourceSkillConfig(role)` — checking `role.sources` first, then falling back to auto-detected dialect
2. Determines the source project directory via `getSourceProjectDir(role)`
3. Reads all skills from the source using `readSkills(sourceConfig, sourceProjectDir)`
4. For each skill in each role of the agent, matches by name and populates `contentMap`, `description`, and `artifacts`
5. Emits a warning for any referenced skill not found in the source

#### Scenario: Resolve content for local role skill
- **WHEN** `resolveSkillContent` processes a skill from a local role with source config `projectFolder: ".claude/skills"`
- **AND** the source project directory contains `.claude/skills/labeling/SKILL.md`
- **THEN** the skill's `contentMap` SHALL be populated with the contents of all files in that directory

#### Scenario: Resolve content for packaged role skill
- **WHEN** `resolveSkillContent` processes a skill from a packaged role at `/packages/my-role/`
- **AND** `/packages/my-role/skills/labeling/` contains `SKILL.md` and `schemas/labels.json`
- **THEN** the skill's `contentMap` SHALL be populated with both files

#### Scenario: Missing source directory leaves contentMap empty
- **WHEN** `resolveSkillContent` processes a skill whose source directory does not exist
- **THEN** the skill's `contentMap` SHALL remain `undefined` (no error thrown, but a warning is emitted)

### Requirement: MASON_SKILL_CONFIG defines the canonical mason skill folder

The role materializer SHALL define a `MASON_SKILL_CONFIG: AgentSkillConfig` constant with `projectFolder: ".mason/skills"`. This SHALL be used as the fallback when resolving skill content for roles with mason dialect and no explicit `sources`.

#### Scenario: Mason dialect uses .mason/skills
- **WHEN** `resolveSkillContent` processes a role with mason or absent dialect and no `sources` field
- **THEN** it SHALL use `.mason/skills` as the source skill project folder

### Requirement: role.sources overrides auto-detected dialect for source resolution

When a role declares `sources` (e.g., `sources: [".claude"]`), the `getSourceSkillConfig` and `getSourceTaskConfig` functions SHALL check `role.sources` first before falling back to the auto-detected `role.source.agentDialect`. For each source entry:
1. Strip leading `.` if present (e.g., `.claude` → `claude`)
2. Resolve to a dialect via `getDialectByDirectory` (e.g., `claude` → `claude-code-agent`)
3. Look up the corresponding `AgentPackage` from the registry
4. Return the agent package's `skills` or `tasks` config if present

#### Scenario: Mason role with .claude source resolves skills from .claude/skills
- **WHEN** a role at `.mason/roles/lead/` has `sources: [".claude"]`
- **AND** `role.source.agentDialect` is `"mason"` (auto-detected)
- **THEN** `getSourceSkillConfig` SHALL return the claude-code-agent's skill config (`{ projectFolder: ".claude/skills" }`)
- **AND** it SHALL NOT fall back to `MASON_SKILL_CONFIG`

#### Scenario: Source entry with leading dot is normalized
- **WHEN** `sources` contains `".claude"`
- **THEN** the resolver SHALL strip the dot and resolve `"claude"` via `getDialectByDirectory`

#### Scenario: Source entry without leading dot is accepted
- **WHEN** `sources` contains `"claude"`
- **THEN** the resolver SHALL resolve `"claude"` via `getDialectByDirectory` directly

#### Scenario: No sources falls back to dialect
- **WHEN** a role has no `sources` field (or empty array)
- **THEN** `getSourceSkillConfig` SHALL fall back to the auto-detected `role.source.agentDialect`

### Requirement: Validation warnings for unresolved skills and tasks

When `resolveSkillContent` or `resolveTaskContent` cannot find a referenced skill or task in the source directory, it SHALL emit a `console.warn` message identifying the missing item and the searched directory.

#### Scenario: Missing skill emits warning
- **WHEN** `resolveSkillContent` processes a skill named `"my-skill"` that does not exist in the source directory
- **AND** the source config has `projectFolder: ".claude/skills"`
- **THEN** it SHALL emit: `Warning: skill "my-skill" not found in source (searched .claude/skills)`

#### Scenario: Missing task emits warning
- **WHEN** `resolveTaskContent` processes a task named `"my-task"` that does not exist in the source directory
- **AND** the source config has `projectFolder: ".claude/commands"`
- **THEN** it SHALL emit: `Warning: task "my-task" not found in source (searched .claude/commands)`

#### Scenario: Found skill does not emit warning
- **WHEN** `resolveSkillContent` processes a skill that exists in the source directory
- **THEN** it SHALL NOT emit any warning

### Requirement: readSkills and materializeSkills are symmetric

Reading skills written by `materializeSkills` using the same `AgentSkillConfig` SHALL produce `ResolvedSkill` objects with equivalent `contentMap` entries.

#### Scenario: Round-trip preserves skill content
- **GIVEN** a `ResolvedSkill` with `contentMap` containing `SKILL.md` and `templates/default.md`
- **AND** an `AgentSkillConfig` with `projectFolder: ".claude/skills"`
- **WHEN** `materializeSkills([skill], config)` writes the files
- **AND** `readSkills(config, outputDir)` reads them back
- **THEN** the resulting skill SHALL have equivalent `contentMap` entries
