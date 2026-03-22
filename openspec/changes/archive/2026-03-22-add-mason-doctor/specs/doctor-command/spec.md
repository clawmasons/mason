## ADDED Requirements

### Requirement: mason doctor command is registered as a CLI command

The CLI SHALL register a `doctor` command with optional `--quick` and `--auto` flags.

#### Scenario: Command registration
- **WHEN** the CLI program is initialized
- **THEN** the `doctor` command SHALL be available with options `--quick` (boolean, default false) and `--auto` (boolean, default false)

### Requirement: mason doctor full mode scans all Docker resources

In full mode (default, no `--quick` flag), the doctor command SHALL scan and report on: running containers, stopped containers, dangling images, unused volumes, unused networks, build cache size, disk usage summary, and orphaned `.mason/sessions/` directories.

#### Scenario: Full scan with resources found
- **WHEN** `mason doctor` is executed
- **AND** there are stopped mason containers, dangling images, and orphaned session directories
- **THEN** the command SHALL display a categorized report of all findings with counts and sizes where available

#### Scenario: Full scan with clean system
- **WHEN** `mason doctor` is executed
- **AND** there are no stale Docker resources or orphaned sessions
- **THEN** the command SHALL report that the system is clean and no cleanup is needed

### Requirement: mason doctor quick mode scans only safe-to-remove resources

In quick mode (`--quick` flag), the doctor command SHALL scan only: stopped containers, dangling images, and orphaned `.mason/sessions/` directories. It SHALL NOT scan running containers, unused volumes, unused networks, build cache, or disk usage.

#### Scenario: Quick scan finds stale resources
- **WHEN** `mason doctor --quick` is executed
- **AND** there are stopped mason containers and orphaned session directories
- **THEN** the command SHALL report only stopped containers, dangling images, and orphaned sessions

#### Scenario: Quick scan skips running containers
- **WHEN** `mason doctor --quick` is executed
- **AND** there are running mason containers but no stopped containers
- **THEN** the command SHALL report no issues found (running containers are not flagged in quick mode)

### Requirement: mason doctor prompts for cleanup confirmation

When stale resources are found and `--auto` is not set, the doctor command SHALL prompt the user to confirm before performing cleanup.

#### Scenario: User confirms cleanup
- **WHEN** `mason doctor` finds stale resources
- **AND** `--auto` is not set
- **AND** the user confirms the cleanup prompt
- **THEN** the command SHALL proceed to remove the identified stale resources

#### Scenario: User declines cleanup
- **WHEN** `mason doctor` finds stale resources
- **AND** `--auto` is not set
- **AND** the user declines the cleanup prompt
- **THEN** the command SHALL exit without removing any resources

### Requirement: mason doctor auto mode skips confirmation

When `--auto` is set, the doctor command SHALL skip confirmation prompts and execute cleanup immediately.

#### Scenario: Auto cleanup in quick mode
- **WHEN** `mason doctor --quick --auto` is executed
- **AND** there are stopped containers and orphaned sessions
- **THEN** the command SHALL remove them without prompting

#### Scenario: Auto cleanup in full mode
- **WHEN** `mason doctor --auto` is executed
- **AND** there are stale resources
- **THEN** the command SHALL remove them without prompting

### Requirement: mason doctor cleans up stopped containers

During cleanup, the doctor command SHALL remove stopped mason containers using `docker rm`.

#### Scenario: Stopped containers removed
- **WHEN** cleanup is triggered
- **AND** there are stopped containers matching mason naming patterns
- **THEN** the command SHALL remove each stopped container and report the count removed

### Requirement: mason doctor cleans up dangling images

During cleanup, the doctor command SHALL remove dangling images using `docker image prune`.

#### Scenario: Dangling images pruned
- **WHEN** cleanup is triggered
- **AND** there are dangling images
- **THEN** the command SHALL prune dangling images and report space reclaimed

### Requirement: mason doctor cleans up orphaned session directories

During cleanup, the doctor command SHALL remove `.mason/sessions/` directories whose corresponding docker-compose services are not running.

#### Scenario: Orphaned session directory removed
- **WHEN** cleanup is triggered
- **AND** `.mason/sessions/abc123/` exists but no containers for that session are running
- **THEN** the command SHALL remove the directory and report it as cleaned

#### Scenario: Active session directory preserved
- **WHEN** cleanup is triggered
- **AND** `.mason/sessions/def456/` exists and its containers are running
- **THEN** the command SHALL NOT remove that session directory

### Requirement: mason doctor full mode cleans up volumes and networks

In full mode cleanup, the doctor command SHALL additionally remove unused mason volumes and unused mason networks.

#### Scenario: Unused volumes removed
- **WHEN** full mode cleanup is triggered
- **AND** there are unused Docker volumes matching mason naming patterns
- **THEN** the command SHALL remove the unused volumes

#### Scenario: Unused networks removed
- **WHEN** full mode cleanup is triggered
- **AND** there are unused Docker networks matching mason naming patterns
- **THEN** the command SHALL remove the unused networks

### Requirement: mason doctor handles Docker unavailability gracefully

If Docker is not available or not running, the doctor command SHALL print a clear error and exit with code 1.

#### Scenario: Docker not running
- **WHEN** `mason doctor` is executed
- **AND** Docker daemon is not running
- **THEN** the command SHALL print an error indicating Docker is not available and exit with code 1

### Requirement: mason doctor exports a quick auto cleanup function

The doctor module SHALL export a function (e.g., `quickAutoCleanup(projectDir)`) that performs the equivalent of `--quick --auto` mode silently, suitable for programmatic use by other commands.

#### Scenario: Programmatic quick cleanup
- **WHEN** `quickAutoCleanup(projectDir)` is called
- **THEN** it SHALL scan for stopped containers, dangling images, and orphaned sessions
- **AND** remove any found without prompting
- **AND** return silently without printing a report
