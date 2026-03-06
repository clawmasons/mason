## ADDED Requirements

### Requirement: forge-core package exists as npm workspace member
The repository SHALL contain a `forge-core/` directory at the repo root with a valid `package.json` named `@clawmasons/forge-core`. The root `package.json` SHALL declare `"workspaces": ["forge-core"]`.

#### Scenario: forge-core package.json is valid
- **WHEN** `forge-core/package.json` is read
- **THEN** it has `name: "@clawmasons/forge-core"`, a `version` field, and a `files` array including `"apps"`, `"tasks"`, `"skills"`, `"roles"`, `"agents"`

#### Scenario: Root package.json declares forge-core as workspace
- **WHEN** the root `package.json` is read
- **THEN** it contains `"workspaces": ["forge-core"]`

#### Scenario: npm install succeeds at root
- **WHEN** `npm install` is run at the repository root
- **THEN** the command succeeds without errors

### Requirement: forge-core contains all five component types with @clawmasons scope
The `forge-core/` package SHALL contain sub-directories for all five forge component types (`apps/`, `tasks/`, `skills/`, `roles/`, `agents/`), each containing at least one component with `@clawmasons/*` scoped package names.

#### Scenario: App component exists
- **WHEN** `forge-core/apps/filesystem/package.json` is read
- **THEN** it has `name: "@clawmasons/app-filesystem"` and a valid `forge` field with `type: "app"`

#### Scenario: Task component exists
- **WHEN** `forge-core/tasks/take-notes/package.json` is read
- **THEN** it has `name: "@clawmasons/task-take-notes"` and a valid `forge` field with `type: "task"`

#### Scenario: Skill component exists
- **WHEN** `forge-core/skills/markdown-conventions/package.json` is read
- **THEN** it has `name: "@clawmasons/skill-markdown-conventions"` and a valid `forge` field with `type: "skill"`, and `SKILL.md` exists alongside it

#### Scenario: Role component exists
- **WHEN** `forge-core/roles/writer/package.json` is read
- **THEN** it has `name: "@clawmasons/role-writer"` and a valid `forge` field with `type: "role"`

#### Scenario: Agent component exists
- **WHEN** `forge-core/agents/note-taker/package.json` is read
- **THEN** it has `name: "@clawmasons/agent-note-taker"` and a valid `forge` field with `type: "agent"`

### Requirement: All forge-field cross-references use @clawmasons scope
Every forge-field reference within `forge-core/` components SHALL use `@clawmasons/*` package names — not `@example/*`.

#### Scenario: Task references use @clawmasons scope
- **WHEN** `forge-core/tasks/take-notes/package.json` forge field is read
- **THEN** `requires.apps` contains `"@clawmasons/app-filesystem"` and `requires.skills` contains `"@clawmasons/skill-markdown-conventions"`

#### Scenario: Role references use @clawmasons scope
- **WHEN** `forge-core/roles/writer/package.json` forge field is read
- **THEN** `tasks` contains `"@clawmasons/task-take-notes"`, `skills` contains `"@clawmasons/skill-markdown-conventions"`, and `permissions` keys use `"@clawmasons/app-filesystem"`

#### Scenario: Agent references use @clawmasons scope
- **WHEN** `forge-core/agents/note-taker/package.json` forge field is read
- **THEN** `roles` contains `"@clawmasons/role-writer"`

### Requirement: forge-core produces a valid npm tarball
Running `npm pack` in `forge-core/` SHALL produce a `.tgz` file containing all component directories and their contents.

#### Scenario: npm pack succeeds
- **WHEN** `npm pack` is run in `forge-core/`
- **THEN** a `.tgz` file is produced without errors

#### Scenario: Tarball contains all components
- **WHEN** the `.tgz` tarball is inspected
- **THEN** it contains `package/apps/filesystem/package.json`, `package/tasks/take-notes/package.json`, `package/skills/markdown-conventions/package.json`, `package/skills/markdown-conventions/SKILL.md`, `package/roles/writer/package.json`, `package/agents/note-taker/package.json`, and `package/tasks/take-notes/prompts/take-notes.md`
