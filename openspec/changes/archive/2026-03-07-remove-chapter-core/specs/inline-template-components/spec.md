## ADDED Requirements

### Requirement: Template includes app components with projectScope placeholders
The `templates/note-taker/` directory SHALL contain `apps/filesystem/package.json` with `name: "@{{projectScope}}/app-filesystem"` and a valid chapter field with `type: "app"`.

#### Scenario: App component exists in template
- **WHEN** `templates/note-taker/apps/filesystem/package.json` is read
- **THEN** it has `name: "@{{projectScope}}/app-filesystem"` and a valid `chapter` field with `type: "app"`, `transport: "stdio"`, and `command: "npx"`

### Requirement: Template includes skill components with projectScope placeholders
The `templates/note-taker/` directory SHALL contain `skills/markdown-conventions/package.json` with `name: "@{{projectScope}}/skill-markdown-conventions"` and a valid chapter field with `type: "skill"`. The `SKILL.md` artifact SHALL be included alongside it.

#### Scenario: Skill component exists in template
- **WHEN** `templates/note-taker/skills/markdown-conventions/package.json` is read
- **THEN** it has `name: "@{{projectScope}}/skill-markdown-conventions"` and a valid `chapter` field with `type: "skill"`

#### Scenario: Skill artifact exists in template
- **WHEN** `templates/note-taker/skills/markdown-conventions/` is inspected
- **THEN** `SKILL.md` exists alongside `package.json`

### Requirement: Template includes task components with projectScope placeholders
The `templates/note-taker/` directory SHALL contain `tasks/take-notes/package.json` with `name: "@{{projectScope}}/task-take-notes"` and a valid chapter field with `type: "task"`. The task's `requires` references SHALL use `@{{projectScope}}/` scoped names. The `prompts/take-notes.md` file SHALL be included.

#### Scenario: Task component exists in template
- **WHEN** `templates/note-taker/tasks/take-notes/package.json` is read
- **THEN** it has `name: "@{{projectScope}}/task-take-notes"` and a valid `chapter` field with `type: "task"` and `taskType: "subagent"`

#### Scenario: Task requires use projectScope placeholders
- **WHEN** `templates/note-taker/tasks/take-notes/package.json` chapter field is read
- **THEN** `requires.apps` contains `"@{{projectScope}}/app-filesystem"` and `requires.skills` contains `"@{{projectScope}}/skill-markdown-conventions"`

#### Scenario: Task prompt file exists in template
- **WHEN** `templates/note-taker/tasks/take-notes/` is inspected
- **THEN** `prompts/take-notes.md` exists

### Requirement: Template role permissions use projectScope placeholders
The `templates/note-taker/roles/writer/package.json` chapter field permissions keys SHALL use `@{{projectScope}}/` scoped names instead of `@clawmasons/` scoped names.

#### Scenario: Role permissions use projectScope
- **WHEN** `templates/note-taker/roles/writer/package.json` chapter field is read
- **THEN** `permissions` keys use `@{{projectScope}}/app-filesystem` (not `@clawmasons/app-filesystem`)
