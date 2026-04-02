## MODIFIED Requirements

### Requirement: chapter run uses two-phase Docker Compose strategy

The run command SHALL use a two-phase Docker Compose startup strategy. On failure in either phase, the catch block SHALL execute Docker teardown (`docker compose down --volumes`) before exiting. On signal interruption (SIGINT/SIGTERM), cleanup SHALL be triggered via the shared `registerSessionCleanup` mechanism. On normal completion, signal handlers SHALL be unregistered after inline teardown.

#### Scenario: Successful two-phase startup
- **WHEN** the run command starts a session
- **THEN** it first starts proxy services, then starts runtime services
- **AND** session cleanup is registered after Docker resources are established

#### Scenario: Docker Compose failure in proxy phase
- **WHEN** Docker Compose fails during proxy startup
- **THEN** the catch block runs `docker compose down --volumes` via `runCleanup()` before `process.exit(1)`

#### Scenario: Docker Compose failure in runtime phase
- **WHEN** Docker Compose fails during runtime startup
- **THEN** the catch block runs `docker compose down --volumes` via `runCleanup()` before `process.exit(1)`

#### Scenario: Signal during active session triggers cleanup
- **WHEN** SIGINT or SIGTERM is received during an active session
- **THEN** the host proxy is stopped and `docker compose down --volumes` is executed
- **AND** the process exits with code 1
