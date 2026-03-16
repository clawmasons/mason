## Why

`RoleType` and `roleTypeSchema` are verbose — the "Type" suffix is redundant when the concept is already called a "Role". Renaming the type, schema, and associated files to drop the "type" nomenclature improves consistency and readability throughout the codebase.

## What Changes

- **BREAKING**: Rename exported TypeScript type `RoleType` → `Role` in `@clawmasons/shared`
- **BREAKING**: Rename exported Zod schema `roleTypeSchema` → `roleSchema` in `@clawmasons/shared`
- Rename source files: `role-types.ts` → `role.ts` (both in `src/types/` and `src/schemas/`)
- Rename test file: `packages/shared/tests/role-types.test.ts` → `packages/shared/tests/role.test.ts`
- Rename spec folder: `openspec/specs/role-types-core-type-system/` → `openspec/specs/role-core-type-system/`
- Update all usages of `RoleType` and `roleTypeSchema` in TypeScript source files (~20 files)
- Update all import paths that reference renamed files
- Update all occurrences in spec.md files (11 files under `openspec/specs/`)
- Update all occurrences in docs (`DEVELOPMENT.md`, `docs/*.md`, PRD/IMPLEMENTATION files)

## Capabilities

### New Capabilities

*(none)*

### Modified Capabilities

- `role-types-core-type-system`: Exported type renamed from `RoleType` → `Role`, schema renamed from `roleTypeSchema` → `roleSchema`

## Impact

- **`@clawmasons/shared`**: Exported type `RoleType` → `Role`, schema `roleTypeSchema` → `roleSchema` (**BREAKING** for consumers)
- **`packages/cli`**: All internal usages updated (~14 source files, ~3 test files)
- **`packages/shared`**: Type definition, schema definition, index export, and tests updated; 2 files renamed
- **Spec folder**: `openspec/specs/role-types-core-type-system/` renamed to `openspec/specs/role-core-type-system/`
- **Docs & Specs**: 11 spec files, `DEVELOPMENT.md`, PRD/IMPLEMENTATION.md updated
- **`e2e/tests`**: 1 e2e test file updated
