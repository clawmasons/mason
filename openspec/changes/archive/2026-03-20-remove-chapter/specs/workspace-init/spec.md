## MODIFIED Requirements

### Requirement: Template member validates against member schema after init
When `mason init --template note-taker` is run, the generated member package.json SHALL have its metadata field under the `mason` key (CLI_NAME_LOWERCASE) parseable with `parseField()`.

#### Scenario: Template member validates against member schema after init
- **WHEN** `mason init --template note-taker --name @acme/my-project` is run and the generated `members/note-taker/package.json` field (under the `mason` key) is parsed with `parseField()`
- **THEN** the parse succeeds, `type` is `"member"`, and `memberType` is `"agent"`

### Requirement: Template directory structure
The `@clawmasons/mason` package SHALL contain a `templates/` directory with at least one template (`note-taker/`). Each template directory SHALL contain the files needed to bootstrap a working project. Template package.json files SHALL use the `mason` key (CLI_NAME_LOWERCASE) for their metadata field instead of `chapter`.

#### Scenario: Template member references local role
- **WHEN** `templates/note-taker/members/note-taker/package.json` is read
- **THEN** the `mason` field has `type: "member"`, `memberType: "agent"`, and `roles` contains `@{{projectScope}}/role-writer`

#### Scenario: Template role references local components
- **WHEN** `templates/note-taker/roles/writer/package.json` is read
- **THEN** the `mason` field has `type: "role"`, tasks include `@{{projectScope}}/task-take-notes`, skills include `@{{projectScope}}/skill-markdown-conventions`, and permissions reference `@{{projectScope}}/app-filesystem`
