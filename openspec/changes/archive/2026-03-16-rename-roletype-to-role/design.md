## Context

The `RoleType` TypeScript type and `roleTypeSchema` Zod schema are exported from `@clawmasons/shared` and used across `packages/shared`, `packages/cli`, tests, e2e tests, and documentation. The "Type" suffix in both names is redundant. This change renames them to `Role` and `roleSchema` respectively, and renames the associated source files to match.

Affected files (per research):
- ~14 TypeScript source files across `packages/shared` and `packages/cli`
- ~6 test files
- 11 `openspec/specs/**/*.md` files
- `DEVELOPMENT.md`, PRD/IMPLEMENTATION.md

## Goals / Non-Goals

**Goals:**
- Rename the exported type `RoleType` → `Role` in `@clawmasons/shared`
- Rename the exported Zod schema `roleTypeSchema` → `roleSchema` in `@clawmasons/shared`
- Rename `packages/shared/src/types/role-types.ts` → `role.ts`
- Rename `packages/shared/src/schemas/role-types.ts` → `role.ts`
- Rename `packages/shared/tests/role-types.test.ts` → `role.test.ts`
- Rename spec folder `openspec/specs/role-types-core-type-system/` → `openspec/specs/role-core-type-system/`
- Update all internal usages across packages, tests, and e2e
- Update all import paths referencing renamed files
- Update all documentation: spec.md files, DEVELOPMENT.md, PRD/IMPLEMENTATION files

**Non-Goals:**
- Renaming other `role-*` files unrelated to the type system (e.g., `role-adapter.ts`, `role-materializer.ts`)
- Changing the Zod schema structure or validation logic
- Updating `openspec/changes/archive/` — historical records stay as-is

## Decisions

**1. Update the type and schema definitions first, then consumers**
Change `export type RoleType` → `export type Role` and `export const roleTypeSchema` → `export const roleSchema` in their source files, update `packages/shared/src/index.ts`, then update all consumers. TypeScript compilation catches any missed usages.

**2. Rename files after updating their contents**
Update internal content first, then rename the file and fix any import paths that reference the old filename. This keeps each step verifiable.

**3. Rename spec folder via `git mv`**
Use `git mv openspec/specs/role-types-core-type-system openspec/specs/role-core-type-system` to preserve git history on the spec file.

**4. No re-export aliases**
Do not add `export type RoleType = Role` or `export { roleSchema as roleTypeSchema }` shims. All usages are internal to this monorepo — a clean cut is cleaner than backwards-compat noise.

## Risks / Trade-offs

- **Missed import paths** → TypeScript compilation (`npx tsc --noEmit`) will catch unresolved imports after file renames.
- **Missed occurrences in docs** → Grep for `RoleType` and `roleTypeSchema` in `.md` files after changes to verify.
- **Archive files** (`openspec/changes/archive/`) contain `RoleType`/`roleTypeSchema` references — leave them unchanged to preserve history.
