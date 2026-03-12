# Tasks: Docker Generation + Container Ignore

## Implementation Tasks

- [x] 1. Create `docker-generator.ts` with volume masking logic
  - `generateVolumeMasks(ignorePaths)` — classify paths, generate entries
  - `sanitizeVolumeName(path)` — convert path to valid Docker volume name
  - `ensureSentinelFile(projectDir)` — create `.clawmasons/empty-file` with `chmod 444`

- [x] 2. Create `generateRoleDockerBuildDir()` function
  - Generate `<agent-type>/Dockerfile` using existing `generateAgentDockerfile()`
  - Generate `<agent-type>/workspace/` using `materializeForAgent()`
  - Generate `mcp-proxy/Dockerfile` using existing `generateProxyDockerfile()`
  - Generate reference `docker-compose.yaml`

- [x] 3. Create `generateSessionComposeYml()` function
  - All paths relative to session directory
  - Include project mount at `/home/mason/workspace/project/:ro`
  - Include volume mask entries after project mount
  - Include named volume declarations
  - Proxy and agent services with correct build contexts

- [x] 4. Create `createSessionDirectory()` function
  - Generate session ID
  - Create `.clawmasons/sessions/<session-id>/`
  - Create `logs/` subdirectory
  - Write `docker-compose.yaml`
  - Ensure sentinel file exists

- [x] 5. Write unit tests (37 tests, all passing)
  - Volume masking: directories vs files classification
  - Volume masking: correct Docker volume entries generated
  - Volume masking: targets only `/home/mason/workspace/project/` paths
  - Sentinel file: created with correct permissions
  - Session directory: structure matches spec
  - Session compose: all paths resolvable from session dir
  - Build directory: matches PRD section 7.1 structure

- [x] 6. Export from materializer index
  - Export new functions from `packages/cli/src/materializer/index.ts`

- [x] 7. Verify: `npx tsc --noEmit` compiles
- [x] 8. Verify: `npx vitest run` passes (1310 tests, all passing)
