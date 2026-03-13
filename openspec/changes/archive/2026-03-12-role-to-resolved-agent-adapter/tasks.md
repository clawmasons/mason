# Tasks: RoleType-to-ResolvedAgent Adapter

## Implementation Tasks

- [ ] Create `packages/shared/src/role/adapter.ts` with `adaptRoleToResolvedAgent()` function
- [ ] Create `AdapterError` error class
- [ ] Implement TaskRef → ResolvedTask mapping
- [ ] Implement AppConfig → ResolvedApp mapping
- [ ] Implement SkillRef → ResolvedSkill mapping
- [ ] Implement permissions aggregation from apps[].tools
- [ ] Implement container requirements mapping (apt, mounts, baseImage)
- [ ] Implement governance mapping (risk, constraints, credentials)
- [ ] Export from `packages/shared/src/role/index.ts`
- [ ] Export from `packages/shared/src/index.ts`

## Test Tasks

- [ ] Create `packages/shared/tests/role-adapter.test.ts`
- [ ] Test basic adaptation with all fields populated
- [ ] Test minimal role (required fields only, verify defaults)
- [ ] Test app permissions aggregation
- [ ] Test container requirements carry-through
- [ ] Test governance fields carry-through
- [ ] Test invalid agent type throws AdapterError
- [ ] Test round-trip for each dialect (claude-code, codex, aider)

## Verification Tasks

- [ ] `npx tsc --noEmit` compiles
- [ ] `npx vitest run` passes
- [ ] `npx eslint src/ tests/` passes (in shared package)
