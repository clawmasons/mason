## 1. Remove generateAcpConfigJson from agent-sdk

- [ ] 1.1 Delete `generateAcpConfigJson` function from `packages/agent-sdk/src/helpers.ts`
- [ ] 1.2 Remove `generateAcpConfigJson` export from `packages/agent-sdk/src/index.ts`
- [ ] 1.3 Remove `generateAcpConfigJson` re-export from `packages/cli/src/materializer/common.ts`
- [ ] 1.4 Remove ACP config generation and import from `packages/claude-code/src/materializer.ts` (`.chapter/acp.json` result.set + import)
- [ ] 1.5 Remove ACP config generation and import from `packages/mcp-agent/src/materializer.ts`
- [ ] 1.6 Remove ACP config generation and import from `packages/pi-coding-agent/src/materializer.ts`
- [ ] 1.7 Update `packages/agent-sdk/tests/helpers.test.ts` — remove `generateAcpConfigJson` test suite
- [ ] 1.8 Update all materializer tests to remove `.chapter/acp.json` scenarios and completeness assertions

## 2. Update docker-generator to write materialized files to new paths

- [ ] 2.1 In `docker-generator.ts` `generateRoleDockerBuildDir`, write materializer output keys that are NOT `agent-launch.json` to `{agentDir}/build/workspace/project/`
- [ ] 2.2 Write `agent-launch.json` output key to `{agentDir}/workspace/` (unchanged behavior, new explicit routing)
- [ ] 2.3 Add `workspacePath` option to `SessionComposeOptions` and pass `{agentDir}/workspace/` when generating session compose
- [ ] 2.4 Add `buildWorkspaceProjectPath` option to `SessionComposeOptions` and pass `{agentDir}/build/workspace/project/` when generating session compose
- [ ] 2.5 Implement workspace bind mount in `generateSessionComposeYml`: map `workspacePath` → `/home/mason/workspace`
- [ ] 2.6 Implement build overlay mounts in `generateSessionComposeYml`: enumerate files/dirs in `buildWorkspaceProjectPath` and emit per-entry bind mounts to `/home/mason/workspace/project/{name}`
- [ ] 2.7 Update `createSessionDirectory` to pass both new paths to `generateSessionComposeYml`

## 3. Update agent Dockerfile COPY path

- [ ] 3.1 In `agent-dockerfile.ts`, change `workspaceCopyLine` from `COPY {role}/{agent}/workspace/` to `COPY {role}/{agent}/build/workspace/`
- [ ] 3.2 Update `generateAgentDockerfile` tests to assert the new COPY path and assert absence of old path

## 4. Update docker-generator tests

- [ ] 4.1 Update `generateRoleDockerBuildDir` tests to verify files land in `build/workspace/project/` (not `workspace/`)
- [ ] 4.2 Update `generateSessionComposeYml` tests to assert workspace mount at `/home/mason/workspace`
- [ ] 4.3 Update `generateSessionComposeYml` tests to assert build overlay mounts for each `build/workspace/project/` file
- [ ] 4.4 Update `createSessionDirectory` tests if they assert on compose file content

## 5. Verify

- [ ] 5.1 Run `npx tsc --noEmit` — no type errors
- [ ] 5.2 Run `npx eslint src/ tests/` in affected packages
- [ ] 5.3 Run `npx vitest run` — all tests pass
