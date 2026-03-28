## Tasks

- [x] 1. Update `generateSessionComposeYml()` in `packages/cli/src/materializer/docker-generator.ts`
  - Added session directory bind mount line: `{sessionDir}:/home/mason/.mason/session`
  - Mount is unconditional (every session gets it)
  - Placed mount after logs mount, before workspace mount

- [x] 2. Update `refreshAgentLaunchJson()` in `packages/cli/src/cli/commands/run-agent.ts`
  - Changed function signature: replaced `dockerBuildDir` param with `sessionDir`
  - Writes `agent-launch.json` to `{sessionDir}/agent-launch.json`
  - Moved all 4 call sites to after `createSessionDirectory()` so session dir exists
  - Passes `session.sessionDir` instead of `dockerBuildDir`

- [x] 3. Update `loadLaunchConfig()` in `packages/agent-entry/src/index.ts`
  - Added `/home/mason/.mason/session/agent-launch.json` as first search path
  - Kept `/home/mason/workspace/agent-launch.json` as second (legacy fallback)
  - Kept `process.cwd()` fallback as third
  - Updated JSDoc comment to reflect new search order

- [x] 4. Add tests for session mount in `packages/cli/tests/materializer/docker-generator.test.ts`
  - Test that compose output contains `/home/mason/.mason/session` volume mount
  - Test that the mount path is relative (uses `./` prefix)

- [x] 5. Add tests for updated search paths in `packages/agent-entry/tests/launch-config.test.ts`
  - Test verifies session path appears before workspace path in search order

- [x] 6. Update CLI tests in `packages/cli/tests/cli/run-agent.test.ts`
  - Updated home mount filter to exclude session mount path

- [x] 7. Verify: `npx tsc --noEmit`, linter, unit tests pass
  - TypeScript: clean
  - ESLint: clean
  - CLI tests: 669 passed
  - Agent-entry tests: 12 passed (launch-config), 1 pre-existing failure in launch.test.ts (unrelated)
  - Shared tests: 294 passed
