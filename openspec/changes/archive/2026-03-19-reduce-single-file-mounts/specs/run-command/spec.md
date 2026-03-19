## ADDED Requirements

### Requirement: chapter run applies OCI-gated restart policy

The run command SHALL implement the OCI restart policy (see `oci-restart-policy` spec) when executing the runtime phase (`docker compose run --rm <runtime>`). It SHALL capture the combined output of the invocation and delegate restart decisions to the policy: restart only on `"OCI runtime"` substring, 2s pause, max 3 attempts.

#### Scenario: OCI restart triggered by mount failure
- **WHEN** `docker compose run --rm claude-code-agent` exits non-zero
- **AND** its output contains `"OCI runtime"`
- **THEN** the run command SHALL wait 2s, print the single-file mount list and recommendation, then retry

#### Scenario: Non-OCI failure is not retried
- **WHEN** `docker compose run --rm claude-code-agent` exits non-zero
- **AND** its output does NOT contain `"OCI runtime"`
- **THEN** the run command SHALL exit immediately with the same exit code without retry
