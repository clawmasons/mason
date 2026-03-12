## Why

The agent-roles PRD (Change 1) requires a canonical in-memory type system (ROLE_TYPES) that all role sources normalize into. Without these types, none of the downstream changes (parser, package reader, adapter, materializer, CLI) can be built. This is the foundational layer that every other change depends on.

## What Changes

- `packages/shared/src/schemas/role-types.ts`: New Zod schemas for all 11 ROLE_TYPES: `toolPermissionsSchema`, `roleMetadataSchema`, `taskRefSchema`, `skillRefSchema`, `appConfigSchema`, `mountConfigSchema`, `containerRequirementsSchema`, `governanceConfigSchema`, `resourceFileSchema`, `roleSourceSchema`, `roleTypeSchema`
- `packages/shared/src/types/role-types.ts`: TypeScript types inferred from Zod schemas: `RoleType`, `RoleMetadata`, `TaskRef`, `AppConfig`, `SkillRef`, `ContainerRequirements`, `GovernanceConfig`, `ResourceFile`, `RoleSource`, `MountConfig`, `ToolPermissions`
- `packages/shared/src/schemas/index.ts`: Re-export all ROLE_TYPES schemas
- `packages/shared/src/index.ts`: Export all schemas and types from barrel
- `packages/shared/tests/role-types.test.ts`: 37 tests covering valid construction, required fields, defaults, and rejection of invalid values
- `tsconfig.json`: Added `packages/shared/tests/**/*` to include array for eslint compatibility

## How to Verify

```bash
npx tsc --noEmit          # TypeScript compiles
npx vitest run             # All 1151 tests pass (37 new)
npx eslint packages/shared/src/ packages/shared/tests/  # Lint passes
```
