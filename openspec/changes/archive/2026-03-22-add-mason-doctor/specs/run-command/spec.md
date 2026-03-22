## MODIFIED Requirements

### Requirement: chapter run checks for docker compose availability

Before attempting to start the stack, the run command SHALL verify that `docker compose` (v2) is available on the system. After verification, it SHALL call `quickAutoCleanup(projectDir)` to silently remove stopped containers, dangling images, and orphaned session directories before proceeding with the run.

#### Scenario: Docker Compose not installed
- **WHEN** `chapter run @acme/member-ops` is executed but `docker compose` is not available
- **THEN** the command SHALL print an error indicating Docker Compose v2 is required and exit with code 1

#### Scenario: Quick auto cleanup runs before session creation
- **WHEN** `mason run --role writer` is executed
- **AND** Docker is available
- **THEN** the command SHALL call `quickAutoCleanup(projectDir)` before creating the session directory
- **AND** any stopped containers, dangling images, or orphaned sessions SHALL be silently removed

#### Scenario: Quick auto cleanup failure does not block run
- **WHEN** `mason run --role writer` is executed
- **AND** `quickAutoCleanup` encounters an error (e.g., Docker resource locked)
- **THEN** the run command SHALL log a warning and continue with session creation
- **AND** the run SHALL NOT fail due to cleanup errors
