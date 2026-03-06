# Spec: e2e-chapter-workflow

## Purpose

End-to-end integration test that validates the full chapter lifecycle from workspace initialization through member installation, registry management, enable/disable workflow, and forge-remnant verification. Uses local tgz packages to test the complete user journey without a registry.

## Requirements

### Requirement: E2E test exercises the complete chapter init and install flow

The integration test (`tests/integration/install-flow.test.ts`) SHALL exercise the complete chapter lifecycle as sequential steps, each depending on the previous.

#### Scenario: Init creates workspace with chapter scaffold
- **WHEN** `chapter init --template note-taker` is run in a temp directory
- **THEN** `.chapter/` directory SHALL be created with `config.json`
- **AND** `members/note-taker/package.json` SHALL exist with the project-scoped name

#### Scenario: Validate confirms member graph is valid
- **WHEN** `chapter validate @<scope>/member-note-taker` is run
- **THEN** the output SHALL contain "is valid"

#### Scenario: List shows member dependency tree
- **WHEN** `chapter list --json` is run
- **THEN** the output SHALL contain the member with roles referencing chapter-core components (task, skill, app)

#### Scenario: Install generates deployment artifacts
- **WHEN** `chapter install @<scope>/member-note-taker` is run
- **THEN** `.chapter/members/note-taker/` SHALL contain proxy/Dockerfile, docker-compose.yml, log/ directory, and claude-code workspace

### Requirement: E2E test verifies the members registry after install

After a successful `chapter install`, the `.chapter/members.json` file SHALL be populated with the correct member entry.

#### Scenario: Members registry contains installed member
- **WHEN** `chapter install` has completed successfully for an agent member with slug `note-taker`
- **THEN** `.chapter/members.json` SHALL exist and be valid JSON
- **AND** it SHALL contain an entry keyed by `note-taker`
- **AND** the entry SHALL have `status: "enabled"`
- **AND** the entry SHALL have `memberType: "agent"`
- **AND** the entry SHALL have a non-empty `package` field matching the scoped package name
- **AND** the entry SHALL have a valid ISO 8601 `installedAt` timestamp

### Requirement: E2E test verifies per-member directory structure completeness

After install, the integration test SHALL verify the complete per-member directory layout for agent members.

#### Scenario: All required directories and files exist
- **WHEN** `chapter install` has completed for an agent member with slug `note-taker` and runtime `claude-code`
- **THEN** the following SHALL exist:
  - `.chapter/members/note-taker/log/` (activity log directory)
  - `.chapter/members/note-taker/proxy/Dockerfile` (proxy build context)
  - `.chapter/members/note-taker/proxy/chapter/dist/` (pre-built chapter artifacts)
  - `.chapter/members/note-taker/proxy/chapter/package.json` (for Docker build)
  - `.chapter/members/note-taker/claude-code/Dockerfile` (runtime Dockerfile)
  - `.chapter/members/note-taker/claude-code/workspace/` (runtime workspace)
  - `.chapter/members/note-taker/claude-code/workspace/.claude/settings.json`
  - `.chapter/members/note-taker/claude-code/workspace/AGENTS.md`
  - `.chapter/members/note-taker/docker-compose.yml`
  - `.chapter/members/note-taker/.env`
  - `.chapter/members/note-taker/chapter.lock.json`

### Requirement: E2E test verifies chapter disable updates the registry

The integration test SHALL verify that `chapter disable` correctly sets the member status to "disabled" in the registry.

#### Scenario: Disable sets status to disabled
- **WHEN** `runDisable(rootDir, "@note-taker")` is called after a successful install
- **THEN** `.chapter/members.json` SHALL show status `"disabled"` for slug `note-taker`
- **AND** all other fields (package, memberType, installedAt) SHALL be preserved

### Requirement: E2E test verifies disabled member cannot be run

The integration test SHALL verify that the run command's guard logic prevents starting a disabled member.

#### Scenario: getMember returns disabled status
- **WHEN** the member has been disabled
- **THEN** `getMember(chapterDir, "note-taker")` SHALL return an entry with `status: "disabled"`
- **AND** the run command (tested via unit tests) SHALL reject the member with an error

### Requirement: E2E test verifies chapter enable re-enables the member

The integration test SHALL verify that `chapter enable` correctly sets the member status back to "enabled".

#### Scenario: Enable restores enabled status
- **WHEN** `runEnable(rootDir, "@note-taker")` is called after the member was disabled
- **THEN** `.chapter/members.json` SHALL show status `"enabled"` for slug `note-taker`

### Requirement: E2E test verifies no forge references in generated files

After the full workflow, the integration test SHALL scan all generated config files under `.chapter/` to verify no "forge" references have leaked through.

#### Scenario: No forge in docker-compose.yml
- **WHEN** `docker-compose.yml` is read from the install output
- **THEN** it SHALL NOT contain the string "forge" (case-insensitive)

#### Scenario: No forge in .env
- **WHEN** `.env` is read from the install output
- **THEN** it SHALL NOT contain the string "forge" (case-insensitive)

#### Scenario: No forge in chapter.lock.json
- **WHEN** `chapter.lock.json` is read from the install output
- **THEN** it SHALL NOT contain the string "forge" (case-insensitive)

#### Scenario: No forge in members.json
- **WHEN** `.chapter/members.json` is read
- **THEN** it SHALL NOT contain the string "forge" (case-insensitive)
