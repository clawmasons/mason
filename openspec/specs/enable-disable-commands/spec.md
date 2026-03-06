# Spec: enable-disable-commands

## Purpose

CLI commands for toggling member operational status (enabled/disabled) in the `.chapter/members.json` registry. Disabled members cannot be started by `chapter run`.

## Requirements

### Requirement: chapter enable command is registered as a CLI command

The CLI SHALL register an `enable` command that accepts a required `<member>` argument (member slug with optional `@` prefix).

#### Scenario: Command registration
- **WHEN** the CLI program is initialized
- **THEN** the `enable` command SHALL be available with argument `<member>`

#### Scenario: Argument format
- **WHEN** the user provides `@note-taker` as the argument
- **THEN** the command SHALL strip the `@` prefix and use `note-taker` as the slug
- **WHEN** the user provides `note-taker` (without `@`)
- **THEN** the command SHALL use `note-taker` as the slug

### Requirement: chapter enable sets member status to "enabled"

The `enable` command SHALL call `updateMemberStatus(chapterDir, slug, "enabled")` to update the member's status in `.chapter/members.json`.

#### Scenario: Enable a disabled member
- **GIVEN** a member with slug `ops` exists in the registry with status `"disabled"`
- **WHEN** `chapter enable @ops` is executed
- **THEN** the member's status SHALL be `"enabled"` in `.chapter/members.json`
- **AND** a success message SHALL be printed: `Member @ops enabled`

#### Scenario: Enable an already enabled member
- **GIVEN** a member with slug `ops` exists in the registry with status `"enabled"`
- **WHEN** `chapter enable @ops` is executed
- **THEN** the member's status SHALL remain `"enabled"` (idempotent)
- **AND** a success message SHALL be printed

#### Scenario: Enable a non-installed member
- **WHEN** `chapter enable @nonexistent` is executed and the slug is not in the registry
- **THEN** an error message SHALL be printed indicating the member was not found
- **AND** the process SHALL exit with code 1

### Requirement: chapter disable command is registered as a CLI command

The CLI SHALL register a `disable` command that accepts a required `<member>` argument (member slug with optional `@` prefix).

#### Scenario: Command registration
- **WHEN** the CLI program is initialized
- **THEN** the `disable` command SHALL be available with argument `<member>`

### Requirement: chapter disable sets member status to "disabled"

The `disable` command SHALL call `updateMemberStatus(chapterDir, slug, "disabled")` to update the member's status in `.chapter/members.json`.

#### Scenario: Disable an enabled member
- **GIVEN** a member with slug `ops` exists in the registry with status `"enabled"`
- **WHEN** `chapter disable @ops` is executed
- **THEN** the member's status SHALL be `"disabled"` in `.chapter/members.json`
- **AND** a success message SHALL be printed: `Member @ops disabled`

#### Scenario: Disable an already disabled member
- **GIVEN** a member with slug `ops` exists in the registry with status `"disabled"`
- **WHEN** `chapter disable @ops` is executed
- **THEN** the member's status SHALL remain `"disabled"` (idempotent)
- **AND** a success message SHALL be printed

#### Scenario: Disable a non-installed member
- **WHEN** `chapter disable @nonexistent` is executed and the slug is not in the registry
- **THEN** an error message SHALL be printed indicating the member was not found
- **AND** the process SHALL exit with code 1

### Requirement: Both commands preserve other member fields

When updating status, the enable and disable commands SHALL preserve all other fields in the member registry entry (package, memberType, installedAt).

#### Scenario: Field preservation on enable
- **GIVEN** a member with package `@test/member-ops`, memberType `agent`, installedAt `2026-03-06T10:30:00.000Z`, status `disabled`
- **WHEN** `chapter enable @ops` is executed
- **THEN** only the `status` field SHALL change; all other fields SHALL be preserved

#### Scenario: Field preservation on disable
- **GIVEN** a member with package `@test/member-ops`, memberType `agent`, installedAt `2026-03-06T10:30:00.000Z`, status `enabled`
- **WHEN** `chapter disable @ops` is executed
- **THEN** only the `status` field SHALL change; all other fields SHALL be preserved
