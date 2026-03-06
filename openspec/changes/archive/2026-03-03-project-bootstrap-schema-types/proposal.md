## Why

forge has no codebase yet — just a PRD and implementation plan. Before any CLI commands, runtime materializers, or governance logic can be built, we need a TypeScript project foundation and the core type system that all downstream components depend on. The five forge package types (app, skill, task, role, agent) are the data contracts everything else validates, resolves, and generates from. Without validated schemas, nothing works.

## What Changes

- Initialize a TypeScript + Node.js project with package.json, tsconfig, vitest, and eslint
- Define TypeScript types and Zod schema validators for all five forge package types: app, skill, task, role, agent
- Define the `ForgeField` discriminated union covering all types
- Add comprehensive unit tests validating all schemas against PRD examples and edge cases
- Establish the project structure (src/, tests/) and build pipeline (tsc, vitest)

## Capabilities

### New Capabilities
- `package-schema-validation`: Zod-based schema validators for the `forge` field in package.json across all five package types (app, skill, task, role, agent). Includes TypeScript type exports, discriminated union parsing, and clear error messages for invalid metadata.

### Modified Capabilities
<!-- No existing capabilities to modify — this is the first change. -->

## Impact

- Creates the root `package.json`, `tsconfig.json`, `vitest.config.ts`, and `eslint.config.js`
- Creates `src/schemas/` with Zod validators for each package type
- Creates `src/types/` with exported TypeScript interfaces
- Creates `tests/schemas/` with unit tests
- Establishes the `@clawmasons/forge` package name and initial exports
- All subsequent changes (CLI, graph resolver, materializers) will import from these schemas
