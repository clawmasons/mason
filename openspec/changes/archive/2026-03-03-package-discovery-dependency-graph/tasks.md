## 1. Resolved Types

- [x] 1.1 Create `src/resolver/types.ts` with `ResolvedApp`, `ResolvedSkill`, `ResolvedTask`, `ResolvedRole`, `ResolvedAgent` interfaces and `DiscoveredPackage` type
- [x] 1.2 Create `src/resolver/errors.ts` with typed error classes: `PackageNotFoundError`, `InvalidForgeFieldError`, `CircularDependencyError`, `TypeMismatchError`
- [x] 1.3 Create `src/resolver/index.ts` re-exporting types, errors, and functions

## 2. Package Discovery

- [x] 2.1 Create `src/resolver/discover.ts` with `discoverPackages(rootDir: string): Map<string, DiscoveredPackage>` that scans workspace directories and node_modules
- [x] 2.2 Handle scoped packages (@org/pkg) in node_modules scanning
- [x] 2.3 Parse each package.json's `forge` field using existing `parseForgeField()`, skip packages without valid forge fields
- [x] 2.4 Handle workspace directory scanning (apps/, tasks/, skills/, roles/, agents/)

## 3. Dependency Graph Resolution

- [x] 3.1 Create `src/resolver/resolve.ts` with `resolveAgent(agentName: string, packages: Map<string, DiscoveredPackage>): ResolvedAgent`
- [x] 3.2 Implement role resolution: for each role in agent's `roles` array, resolve the role package and its tasks/apps/skills
- [x] 3.3 Implement task resolution: for each task, resolve required apps and skills from `requires` field
- [x] 3.4 Implement composite task resolution: recursively resolve sub-tasks via `tasks` field
- [x] 3.5 Implement circular dependency detection with traversal path tracking
- [x] 3.6 Implement type enforcement: validate that dependencies match expected forge types (e.g., agent.roles must reference role-type packages)

## 4. Public API

- [x] 4.1 Update `src/index.ts` to export resolver types and functions
- [x] 4.2 Ensure all exported types are accessible from `@clawmasons/forge`

## 5. Tests

- [x] 5.1 Create test fixture package.json files representing the PRD's repo-ops agent example (agent, 2 roles, tasks, apps, skills)
- [x] 5.2 Create `tests/resolver/discover.test.ts` — test package discovery from workspace dirs and node_modules
- [x] 5.3 Create `tests/resolver/resolve.test.ts` — test full graph resolution with fixture packages
- [x] 5.4 Test circular dependency detection with composite task cycles
- [x] 5.5 Test missing dependency produces actionable error
- [x] 5.6 Test type mismatch (e.g., agent referencing a non-role package) produces error
- [x] 5.7 Test diamond dependencies resolve correctly (same app referenced by multiple roles)

## 6. Verification

- [x] 6.1 Run `npm test` and confirm all 97 tests pass
- [x] 6.2 Run `npm run build` and confirm TypeScript compiles without errors
- [x] 6.3 Run `npm run lint` and confirm no lint errors
