## Why

forge can resolve the full dependency graph from an agent package, but has no way to check that the graph is semantically valid — that role permissions actually cover the tools their tasks need, that allowed tools actually exist on the referenced apps, and that all task skill requirements are satisfied. Without `forge validate`, there's no governance gate for CI/CD pipelines and no way for developers to catch permission gaps before attempting to install or run an agent.

## What Changes

- Implement a validation engine that takes a `ResolvedAgent` and runs all semantic checks against it, collecting errors rather than failing on the first one
- Implement the `forge validate <agent>` CLI command that discovers packages, resolves the agent graph, runs validation, and outputs structured results with an appropriate exit code
- Define typed validation error structures for each check category (requirement coverage, tool existence, skill availability, app launch config)

## Capabilities

### New Capabilities
- `graph-validation`: Validate a resolved agent dependency graph for semantic correctness. Checks requirement coverage (task-required apps are covered by parent role permissions), tool existence (role allow-list tools exist in app's tool list), skill availability (task-required skills are resolvable through the role), and app launch config validity. Collects all errors and returns structured validation results. Includes the `forge validate` CLI command.

### Modified Capabilities

## Impact

- **New source files:** `src/validator/` directory with validation logic, `src/cli/commands/validate.ts` for the CLI command
- **Depends on:** `src/resolver/` for `discoverPackages()` and `resolveAgent()`, existing resolved types
- **New test files:** `tests/validator/validate.test.ts`, `tests/cli/validate.test.ts`
- **Updated exports:** `src/index.ts` updated to export validation functions and types, `src/cli/commands/index.ts` updated to register validate command
- **CI integration:** Exit code 0 on valid, non-zero on invalid — suitable as a CI/CD gate
