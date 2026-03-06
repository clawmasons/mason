# Spec: list-command

## ADDED Requirements

### Requirement: chapter list command is registered as a CLI command

The CLI SHALL register a `list` command with no required arguments and a `--json` flag.

#### Scenario: Command registration
- **WHEN** the CLI program is initialized
- **THEN** the `list` command SHALL be available with flag `--json`

### Requirement: chapter list displays all installed members as a tree

When `chapter list` is run, the command SHALL:
1. Discover packages in the workspace via `discoverPackages()`
2. Find all packages with `chapter.type === "member"`
3. Resolve each member's dependency graph
4. Read the members registry from `.chapter/members.json`
5. Print a tree for each member: member → roles → tasks → apps/skills, with member type and status

#### Scenario: Single member workspace
- **WHEN** `chapter list` is run in a workspace with one member that has 2 roles
- **THEN** the output SHALL show the member name, version, type, and status
- **AND** each role indented under the member with its tasks, apps, and skills

#### Scenario: Multiple member workspace
- **WHEN** `chapter list` is run in a workspace with multiple members
- **THEN** each member SHALL be listed with its full dependency tree

#### Scenario: Empty workspace
- **WHEN** `chapter list` is run in a workspace with no member packages
- **THEN** the command SHALL print "No members found." and exit with code 1

### Requirement: chapter list shows member type and status

The list command SHALL display member type and registry status alongside the member name. The format SHALL be:
- `<name>@<version> (<memberType>, <status>)` when the member is in the registry (e.g., `@test/member-ops@1.0.0 (agent, enabled)`)
- `<name>@<version> (<memberType>)` when the member is not in the registry (e.g., `@test/member-ops@1.0.0 (agent)`)

#### Scenario: Member in registry shows status
- **WHEN** `chapter list` is run and a member is in `.chapter/members.json` with `status: "enabled"`
- **THEN** the output SHALL include `(agent, enabled)` or `(human, enabled)` after the member name

#### Scenario: Disabled member shows disabled status
- **WHEN** `chapter list` is run and a member is in `.chapter/members.json` with `status: "disabled"`
- **THEN** the output SHALL include `(agent, disabled)` or `(human, disabled)` after the member name

#### Scenario: Member not in registry shows type only
- **WHEN** `chapter list` is run and a member package exists but is not in `.chapter/members.json`
- **THEN** the output SHALL include `(<memberType>)` after the member name without a status

### Requirement: chapter list supports JSON output

#### Scenario: JSON output
- **WHEN** `chapter list` is run with `--json`
- **THEN** the output SHALL be a JSON array of resolved member objects
