## Tasks

- [x] Create Zod schemas for all 11 ROLE_TYPES in `packages/shared/src/schemas/role-types.ts`
- [x] Create TypeScript types inferred from schemas in `packages/shared/src/types/role-types.ts`
- [x] Export schemas from `packages/shared/src/schemas/index.ts`
- [x] Export schemas and types from `packages/shared/src/index.ts` barrel
- [x] Write tests: schema validation for all types (37 tests)
- [x] Add `packages/shared/tests/**/*` to root `tsconfig.json` for eslint compatibility
- [x] Verify: `npx tsc --noEmit` compiles
- [x] Verify: `npx vitest run` passes (1151 tests, 37 new)
- [x] Verify: `npx eslint` passes on new files
