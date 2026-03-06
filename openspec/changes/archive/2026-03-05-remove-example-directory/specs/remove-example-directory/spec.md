# Remove example/ Directory Specification

## Purpose

Remove the legacy `example/` directory from the repository after its contents were migrated to `forge-core/` (Change #1) and the template system (Change #3). Update all references in tests and documentation to use `forge-core/` and `@clawmasons/*` naming. Implements PRD REQ-006 (Remove `example/` Directory).

## Requirements

### Requirement: No example/ directory in repository

The `example/` directory SHALL NOT exist in the repository.

#### Scenario: Directory is absent
- **GIVEN** the repository root
- **WHEN** the directory listing is inspected
- **THEN** no `example/` directory exists

### Requirement: No test references to example/

No test file SHALL reference `example/` as a path or `@example/` as a package scope for directory paths or workspace operations.

Note: Generic uses of "example" (such as `.env.example`, `operator@example.com`, or "PRD example" in test names) are acceptable and not covered by this requirement.

#### Scenario: Integration test uses @clawmasons names
- **GIVEN** `tests/integration/forge-proxy.test.ts`
- **WHEN** the file is read
- **THEN** it uses `@clawmasons/app-filesystem` (not `@example/app-filesystem`)

#### Scenario: Shell integration test uses forge-core path
- **GIVEN** `tests/integration/mcp-proxy.sh`
- **WHEN** the file is read
- **THEN** it references `forge-core/` directory (not `example/`)
- **AND** it uses `@clawmasons/agent-note-taker` (not `@example/agent-note-taker`)

### Requirement: README uses @clawmasons names

The `README.md` SHALL use `@clawmasons/*` package names in CLI examples and SHALL NOT reference the `example/` directory.

#### Scenario: CLI examples use canonical names
- **GIVEN** `README.md`
- **WHEN** the file is read
- **THEN** CLI examples use `@clawmasons/agent-note-taker` (not `@example/agent-note-taker`)
- **AND** no line references `example/` as a directory path

### Requirement: All tests pass

All existing tests SHALL continue to pass after the removal.

#### Scenario: Test suite passes
- **WHEN** `npx vitest run` is executed
- **THEN** all tests pass with zero failures
