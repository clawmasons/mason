# Change #2: ROLE.md Parser + Dialect Registry

## Plan

### What this change does
Implement `readMaterializedRole(rolePath: string): RoleType` — parses a local ROLE.md file (YAML frontmatter + markdown body) and produces a ROLE_TYPES object. Also implement the dialect registry that maps agent-specific field names to generic ROLE_TYPES names.

### Key components
1. **Dialect Registry** (`packages/shared/src/role/dialect-registry.ts`) — lookup table mapping directory names to dialect field mappings
2. **Parser** (`packages/shared/src/role/parser.ts`) — `readMaterializedRole()`, YAML frontmatter parsing, field normalization
3. **Resource Scanner** (`packages/shared/src/role/resource-scanner.ts`) — scan role directory for bundled resources

### Tasks
- [x] Step 1 (NEW): Create the openspec change proposal
- [x] Step 2 (FF): Flesh out the spec with design details
- [x] Step 3 (APPLY): Implement the code
  - [x] Add js-yaml dependency to packages/shared
  - [x] Create dialect-registry.ts
  - [x] Create resource-scanner.ts
  - [x] Create parser.ts
  - [x] Export from index.ts
  - [x] Write tests
- [x] Step 4 (TEST): Run all tests and fix regressions
- [x] Step 5 (VERIFY): Verify requirements (tsc, eslint, vitest)
- [x] Step 6 (SYNC): Sync spec with implementation
- [x] Step 7 (ARCHIVE): Archive the completed spec
- [ ] Step 8 (COMMIT): Commit and create PR
