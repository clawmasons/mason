## MODIFIED Requirements

### Requirement: Template directory structure
The `@clawmasons/chapter` package SHALL contain a `templates/` directory with at least one template (`note-taker/`). Each template directory SHALL contain the files needed to bootstrap a working chapter project.

#### Scenario: note-taker template exists
- **WHEN** the `templates/` directory is inspected
- **THEN** `note-taker/` exists containing `package.json`, `members/note-taker/package.json`, `roles/writer/package.json`, `apps/filesystem/package.json`, `tasks/take-notes/package.json`, `tasks/take-notes/prompts/take-notes.md`, `skills/markdown-conventions/package.json`, and `skills/markdown-conventions/SKILL.md`

#### Scenario: Template root package.json has no external dependencies
- **WHEN** `templates/note-taker/package.json` is read
- **THEN** it does NOT list `@clawmasons/chapter-core` as a dependency; `dependencies` is empty or absent

#### Scenario: Template member references local role
- **WHEN** `templates/note-taker/members/note-taker/package.json` is read
- **THEN** the chapter field has `type: "member"`, `memberType: "agent"`, and `roles` contains `@{{projectScope}}/role-writer`

#### Scenario: Template role references local components
- **WHEN** `templates/note-taker/roles/writer/package.json` is read
- **THEN** the chapter field has `type: "role"`, tasks include `@{{projectScope}}/task-take-notes`, skills include `@{{projectScope}}/skill-markdown-conventions`, and permissions reference `@{{projectScope}}/app-filesystem`

#### Scenario: Template member includes identity fields
- **WHEN** `templates/note-taker/members/note-taker/package.json` is read
- **THEN** the chapter field includes `name`, `slug`, `email`, and `authProviders` fields as required by the member schema

#### Scenario: Template member validates against member schema after init
- **WHEN** `chapter init --template note-taker --name @acme/my-project` is run and the generated `members/note-taker/package.json` chapter field is parsed with `parseChapterField()`
- **THEN** the parse succeeds, `type` is `"member"`, and `memberType` is `"agent"`

## REMOVED Requirements

### Requirement: Template root package.json depends on chapter-core
**Reason**: chapter-core is removed. All components are now inlined in the template as local workspace packages with `{{projectScope}}` placeholders.
**Migration**: No migration needed — templates now include all components directly.

### Requirement: Template role references chapter-core components
**Reason**: Role now references local project-scoped components instead of chapter-core components.
**Migration**: Roles use `@{{projectScope}}/` scoped names for tasks, skills, and permission keys.
