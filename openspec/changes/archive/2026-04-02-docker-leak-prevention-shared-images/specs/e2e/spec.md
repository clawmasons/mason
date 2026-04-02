## ADDED Requirements

### Requirement: E2E test suite includes globalTeardown for Docker resource cleanup

The vitest e2e configuration SHALL reference a `globalTeardown` module that prunes orphaned mason Docker resources after all tests complete. The teardown SHALL remove stopped mason containers and unused mason networks. The teardown SHALL run even if tests crash or timeout.

#### Scenario: Orphaned containers pruned after test suite
- **WHEN** the e2e test suite completes (success or failure)
- **THEN** any stopped Docker containers with mason name patterns are removed

#### Scenario: Orphaned networks pruned after test suite
- **WHEN** the e2e test suite completes (success or failure)
- **THEN** any unused Docker networks with mason name patterns are removed

#### Scenario: Teardown does not remove running containers
- **WHEN** the globalTeardown runs
- **THEN** only stopped (exited) mason containers are removed
- **AND** running containers are left untouched
