# chapter-core-package

## Purpose

Defines the structure, naming, and content of the `@clawmasons/chapter-core` component library package — the standard set of reusable apps, tasks, skills, roles, and members that ship with chapter.

## Requirements

### Requirement: chapter-core package exists as npm workspace member
The repository SHALL contain a `chapter-core/` directory at the repo root with a valid `package.json` named `@clawmasons/chapter-core`. The root `package.json` SHALL declare `"workspaces": ["chapter-core"]`.

#### Scenario: chapter-core package.json is valid
- **WHEN** `chapter-core/package.json` is read
- **THEN** it has `name: "@clawmasons/chapter-core"`, a `version` field, and a `files` array including `"apps"`, `"tasks"`, `"skills"`, `"roles"`, `"members"`

#### Scenario: Root package.json declares chapter-core as workspace
- **WHEN** the root `package.json` is read
- **THEN** it contains `"workspaces": ["chapter-core"]`

#### Scenario: npm install succeeds at root
- **WHEN** `npm install` is run at the repository root
- **THEN** the command succeeds without errors

### Requirement: chapter-core contains all five component types with @clawmasons scope
The `chapter-core/` package SHALL contain sub-directories for all five chapter component types (`apps/`, `tasks/`, `skills/`, `roles/`, `members/`), each containing at least one component with `@clawmasons/*` scoped package names.

#### Scenario: App component exists
- **WHEN** `chapter-core/apps/filesystem/package.json` is read
- **THEN** it has `name: "@clawmasons/app-filesystem"` and a valid `chapter` field with `type: "app"`

#### Scenario: Task component exists
- **WHEN** `chapter-core/tasks/take-notes/package.json` is read
- **THEN** it has `name: "@clawmasons/task-take-notes"` and a valid `chapter` field with `type: "task"`

#### Scenario: Skill component exists
- **WHEN** `chapter-core/skills/markdown-conventions/package.json` is read
- **THEN** it has `name: "@clawmasons/skill-markdown-conventions"` and a valid `chapter` field with `type: "skill"`, and `SKILL.md` exists alongside it

#### Scenario: Role component exists
- **WHEN** `chapter-core/roles/writer/package.json` is read
- **THEN** it has `name: "@clawmasons/role-writer"` and a valid `chapter` field with `type: "role"`

#### Scenario: Member component exists
- **WHEN** `chapter-core/members/note-taker/package.json` is read
- **THEN** it has `name: "@clawmasons/member-note-taker"` and a valid `chapter` field with `type: "agent"`

### Requirement: All chapter field cross-references use @clawmasons scope
Every chapter field reference within `chapter-core/` components SHALL use `@clawmasons/*` package names — not `@example/*`.

#### Scenario: Task references use @clawmasons scope
- **WHEN** `chapter-core/tasks/take-notes/package.json` chapter field is read
- **THEN** `requires.apps` contains `"@clawmasons/app-filesystem"` and `requires.skills` contains `"@clawmasons/skill-markdown-conventions"`

#### Scenario: Role references use @clawmasons scope
- **WHEN** `chapter-core/roles/writer/package.json` chapter field is read
- **THEN** `tasks` contains `"@clawmasons/task-take-notes"`, `skills` contains `"@clawmasons/skill-markdown-conventions"`, and `permissions` keys use `"@clawmasons/app-filesystem"`

#### Scenario: Member references use @clawmasons scope
- **WHEN** `chapter-core/members/note-taker/package.json` chapter field is read
- **THEN** `roles` contains `"@clawmasons/role-writer"`

### Requirement: chapter-core produces a valid npm tarball
Running `npm pack` in `chapter-core/` SHALL produce a `.tgz` file containing all component directories and their contents.

#### Scenario: npm pack succeeds
- **WHEN** `npm pack` is run in `chapter-core/`
- **THEN** a `.tgz` file is produced without errors

#### Scenario: Tarball contains all components
- **WHEN** the `.tgz` tarball is inspected
- **THEN** it contains `package/apps/filesystem/package.json`, `package/tasks/take-notes/package.json`, `package/skills/markdown-conventions/package.json`, `package/skills/markdown-conventions/SKILL.md`, `package/roles/writer/package.json`, `package/members/note-taker/package.json`, and `package/tasks/take-notes/prompts/take-notes.md`
