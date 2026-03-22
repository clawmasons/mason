## 1. Add generateProjectRole() function

- [x] 1.1 Add `scanProject` and `getDialect` imports from `@clawmasons/shared` to `run-agent.ts`
- [x] 1.2 Add `AppConfig`, `TaskRef`, `SkillRef` type imports from `@clawmasons/shared`
- [x] 1.3 Implement `generateProjectRole(projectDir, sources)` — validates source dirs, calls scanner, maps ScanResult to Role with first-wins dedup, sets empty instructions, builds container.ignore.paths
- [x] 1.4 Handle error case: no source directory exists → exit with PRD 8.3 message
- [x] 1.5 Handle warning case: empty source directory → warn and proceed
- [x] 1.6 Add `.env` to container.ignore.paths when present at project root

## 2. Update createRunAction() for project role path

- [x] 2.1 Replace "role required" error block with project role generation when no role is provided
- [x] 2.2 Resolve default sources: use `--source` flags if provided, otherwise derive from resolvedAgentType via dialect registry
- [x] 2.3 Call `generateProjectRole()` and store the resulting Role
- [x] 2.4 Use role name `"project"` when passing to `runAgent()`

## 3. Update runAgent() to accept pre-resolved Role

- [x] 3.1 Add `preResolvedRole?: Role` to acpOptions type
- [x] 3.2 Pass `preResolvedRole` through to all mode function calls

## 4. Update mode functions to use pre-resolved Role

- [x] 4.1 In `runAgentInteractiveMode()`: use `preResolvedRole ?? await resolveRoleFn(role, projectDir)`
- [x] 4.2 In `runAgentDevContainerMode()`: same pattern
- [x] 4.3 In `runAgentAcpMode()`: same pattern
- [x] 4.4 In `runProxyOnly()`: same pattern

## 5. Add unit tests

- [x] 5.1 Test: generateProjectRole creates Role from single source with tasks, skills, and apps
- [x] 5.2 Test: generateProjectRole handles multi-source with first-wins dedup
- [x] 5.3 Test: generateProjectRole exits on missing source directory
- [x] 5.4 Test: generateProjectRole warns on empty source directory
- [x] 5.5 Test: generateProjectRole adds .env to ignore paths when present
- [x] 5.6 Test: generateProjectRole sets empty instructions
- [x] 5.7 Test: generateProjectRole sets correct metadata and source fields
- [x] 5.8 Test: generateProjectRole maps MCP server with URL to sse transport

## 6. Fix pre-existing test interaction

- [x] 6.1 Update commands-index.test.ts: "works with parseAsync for known agent types" — use Promise.race with 2s timeout since the mocked process.exit no longer halts the async flow early

## 7. Verification

- [x] 7.1 Run `npx tsc --noEmit` — compiles without errors
- [x] 7.2 Run `npx eslint` on changed files — no lint errors
- [x] 7.3 Run `npx vitest run packages/cli/tests/` — all 662 tests pass (34 files)
- [x] 7.4 Run `npx vitest run packages/shared/tests/` — all 238 tests pass (11 files)
