# Spec: session-cleanup

## Purpose

Shared session cleanup infrastructure for ensuring Docker resources (containers, networks, volumes) are torn down on signals, errors, and normal exit paths.

## Requirements

### Requirement: Shared session cleanup registers signal handlers for Docker teardown

The system SHALL provide a `registerSessionCleanup` helper that accepts an async cleanup callback and returns `{ unregister, runCleanup }`. The helper SHALL install SIGINT and SIGTERM handlers that invoke the cleanup callback and then call `process.exit(1)`. The cleanup callback SHALL be idempotent — multiple invocations MUST result in cleanup running exactly once.

#### Scenario: Signal triggers cleanup during active session
- **WHEN** a SIGINT or SIGTERM signal is received while a session is running
- **THEN** the registered cleanup callback is invoked (stopping host proxy, running `docker compose down --volumes`)
- **AND** `process.exit(1)` is called after cleanup completes

#### Scenario: Cleanup is idempotent
- **WHEN** cleanup is triggered by both a signal and an explicit call (e.g., catch block)
- **THEN** the Docker teardown runs exactly once

#### Scenario: Unregister removes signal listeners
- **WHEN** `unregister()` is called after successful normal-path teardown
- **THEN** the SIGINT and SIGTERM listeners registered by this helper are removed
- **AND** no cleanup or `process.exit` occurs if a signal arrives after unregistration

### Requirement: All run modes wire session cleanup on error paths

All 4 run modes (interactive, JSON streaming, print, dev-container) SHALL register session cleanup after Docker resources are established. Each mode's catch block SHALL call `runCleanup()` before `process.exit(1)`. Each mode's normal exit path SHALL call `unregister()` after inline teardown completes.

#### Scenario: Catch block cleans up Docker resources in interactive mode
- **WHEN** an error is thrown during interactive mode execution after Docker resources exist
- **THEN** `docker compose down --volumes` is executed before `process.exit(1)`

#### Scenario: Catch block cleans up Docker resources in JSON mode
- **WHEN** an error is thrown during JSON streaming mode execution after Docker resources exist
- **THEN** `docker compose down --volumes` is executed before `process.exit(1)`

#### Scenario: Catch block cleans up Docker resources in print mode
- **WHEN** an error is thrown during print mode execution after Docker resources exist
- **THEN** `docker compose down --volumes` is executed before `process.exit(1)`

#### Scenario: Catch block cleans up Docker resources in dev-container mode
- **WHEN** an error is thrown during dev-container mode execution after Docker resources exist
- **THEN** `docker compose down --volumes` is executed before `process.exit(1)`

#### Scenario: Dev-container replaces ad-hoc handlers with shared mechanism
- **WHEN** dev-container mode registers session cleanup
- **THEN** the existing `process.once("SIGINT")` and `process.once("SIGTERM")` ad-hoc handlers are replaced by the shared `registerSessionCleanup` mechanism
