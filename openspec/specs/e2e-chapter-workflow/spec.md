# E2E Mason Workflow — Init, Install, Enable/Disable Lifecycle

The E2E test exercises the complete mason CLI workflow including init, validate, list, install, disable, enable, and verifies no legacy naming remains in generated artifacts.

## Requirements

### Requirement: E2E test exercises the complete mason init and install flow
The integration test SHALL exercise the complete mason lifecycle as sequential steps, each depending on the previous. All CLI invocations SHALL use `mason` (the CLI binary name) instead of `chapter`.

#### Scenario: Init creates workspace with mason scaffold
- **WHEN** `mason init --template note-taker` is run in a temp directory
- **THEN** `.mason/` directory SHALL be created with `config.json`
- **AND** `members/note-taker/package.json` SHALL exist with the project-scoped name

#### Scenario: Validate confirms member graph is valid
- **WHEN** `mason validate @<scope>/member-note-taker` is run
- **THEN** the output SHALL contain "is valid"

#### Scenario: List shows member dependency tree
- **WHEN** `mason list --json` is run
- **THEN** the output SHALL contain the member with roles referencing components (task, skill, app)

#### Scenario: Install generates deployment artifacts
- **WHEN** `mason install @<scope>/member-note-taker` is run
- **THEN** `.clawmasons/members/note-taker/` SHALL contain proxy/Dockerfile, docker-compose.yml, log/ directory, and agent workspace

### Requirement: E2E test verifies the members registry after install
The test SHALL verify that the members registry at `.mason/members.json` is created and contains the installed member with correct metadata.

#### Scenario: Members registry contains installed member
- **WHEN** `.mason/members.json` is read after install
- **THEN** it contains an entry for the installed member with status "enabled"

### Requirement: E2E test verifies mason disable updates the registry
The test SHALL verify that `mason disable` sets the member status to "disabled" in the registry.

#### Scenario: Disable sets status to disabled
- **WHEN** `mason disable @<scope>/member-note-taker` is run
- **THEN** the member's status in `.mason/members.json` is "disabled"

### Requirement: E2E test verifies disabled member cannot be run
The test SHALL verify that attempting to run a disabled member produces an error.

#### Scenario: getMember returns disabled status
- **WHEN** a disabled member is queried
- **THEN** the status SHALL be "disabled"

### Requirement: E2E test verifies mason enable re-enables the member
The test SHALL verify that `mason enable` restores the member to "enabled" status.

#### Scenario: Enable restores enabled status
- **WHEN** `mason enable @<scope>/member-note-taker` is run
- **THEN** the member's status in `.mason/members.json` is "enabled"

### Requirement: E2E test verifies no legacy naming in generated files
The test SHALL verify that generated files contain no references to the previous "forge" or "chapter" naming.

#### Scenario: No legacy names in docker-compose.yml
- **WHEN** the generated `docker-compose.yml` is read
- **THEN** it SHALL NOT contain the strings "forge" or "chapter" (case-insensitive)

#### Scenario: No legacy names in .env
- **WHEN** the generated `.env` is read
- **THEN** it SHALL NOT contain "FORGE_" or "CHAPTER_" prefixed variables

#### Scenario: No legacy names in lock file
- **WHEN** the generated `mason.lock.json` is read
- **THEN** it SHALL NOT contain "forge" or "chapter"

#### Scenario: No legacy names in members.json
- **WHEN** the generated `members.json` is read
- **THEN** it SHALL NOT contain "forge" or "chapter"
