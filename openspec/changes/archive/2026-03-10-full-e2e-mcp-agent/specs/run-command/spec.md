## MODIFIED Requirements

### Requirement: Interactive agent startup
The `run-agent` command SHALL start the agent service using `docker compose run --rm --service-ports` instead of `docker compose up` to properly attach stdin/stdout for interactive use.

#### Scenario: Agent container is interactive
- **WHEN** `chapter run-agent <agent> <role>` starts the agent service
- **THEN** the command SHALL use `docker compose run --rm --service-ports <service>` which allocates a TTY with proper stdin/stdout attachment

#### Scenario: Agent container auto-cleanup
- **WHEN** the agent process exits
- **THEN** the agent container SHALL be automatically removed via `--rm` flag
