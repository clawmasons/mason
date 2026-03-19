# Spec: oci-restart-policy

## Requirements

### Requirement: chapter run restarts only on OCI runtime errors

When the agent container exits with a non-zero code, the run command SHALL inspect the combined stdout+stderr output of the failed `docker compose run` invocation. A restart SHALL only be attempted if the output contains the substring `"OCI runtime"`. Any other non-zero exit SHALL propagate immediately without retry.

#### Scenario: OCI runtime error triggers restart
- **WHEN** `docker compose run --rm <runtime>` exits non-zero
- **AND** the output contains `"OCI runtime"`
- **THEN** the run command SHALL attempt a restart (subject to max-restart limit)

#### Scenario: Non-OCI error does not restart
- **WHEN** `docker compose run --rm <runtime>` exits non-zero
- **AND** the output does NOT contain `"OCI runtime"`
- **THEN** the run command SHALL exit immediately with the same non-zero exit code

#### Scenario: Zero exit does not restart
- **WHEN** `docker compose run --rm <runtime>` exits with code 0
- **THEN** the run command SHALL complete normally without restart

### Requirement: chapter run pauses 2 seconds before OCI restart

Between an OCI runtime error and the next restart attempt, the run command SHALL wait 2000 milliseconds before re-running `docker compose run`.

#### Scenario: 2s pause before restart
- **WHEN** an OCI runtime error triggers a restart
- **THEN** the run command SHALL delay at least 2000ms before issuing the next `docker compose run` invocation

### Requirement: chapter run enforces a maximum of 3 OCI restart attempts

The run command SHALL attempt at most 3 restarts for OCI runtime errors. If the container continues to fail with OCI runtime errors after 3 attempts, the command SHALL exit with a non-zero code.

#### Scenario: Restart succeeds within limit
- **WHEN** the first attempt fails with an OCI runtime error and the second attempt succeeds
- **THEN** the run command SHALL exit with code 0

#### Scenario: Max restarts exceeded
- **WHEN** all 3 restart attempts fail with OCI runtime errors
- **THEN** the run command SHALL exit with a non-zero exit code and print a message indicating max restarts were reached

### Requirement: chapter run displays single-file volume mounts on OCI restart

When an OCI runtime restart is triggered, the run command SHALL display to the user the list of all single-file bind-mount paths in the active compose configuration (volume entries where the host-side path resolves to a regular file, not a directory). The message SHALL recommend moving these files into a directory and mounting the directory instead to avoid mount ordering races.

#### Scenario: Single-file mounts listed on OCI restart
- **WHEN** an OCI runtime error triggers a restart
- **AND** the compose volume list contains entries such as `.env:/home/mason/workspace/.env`
- **THEN** the run command SHALL print the list of single-file mount host paths (e.g., `.env`)
- **AND** SHALL print a recommendation to move them into a directory and use a directory mount instead

#### Scenario: No single-file mounts — no warning printed
- **WHEN** an OCI runtime error triggers a restart
- **AND** all volume entries are directory mounts
- **THEN** the run command SHALL NOT print the single-file mount warning
