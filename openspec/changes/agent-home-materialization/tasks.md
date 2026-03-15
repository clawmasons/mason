## 1. Materializer Interface & Claude Code Home Materialization

- [x] 1.1 Add optional `materializeHome(projectDir: string, homePath: string): void` method to `RuntimeMaterializer` interface in `packages/cli/src/materializer/types.ts`
- [x] 1.2 Implement `materializeHome` on the claude-code materializer in `packages/cli/src/materializer/claude-code.ts`: copy `~/.claude/statsig/`, `~/.claude/settings.json`, `~/.claude/stats-cache.json`, `~/.claude/plans/`, `~/.claude/plugins/`, `~/.claude/skills/`, and `~/.claude.json` to `homePath`
- [x] 1.3 Implement projects directory path transformation in `materializeHome`: copy `~/.claude/projects/`, flatten projectDir path (`/` → `-`), delete non-matching project dirs, rename matching dir to `-home-mason-workspace-project`
- [x] 1.4 Add unit tests for `materializeHome` — all paths exist, missing paths skipped, projects path transformation, no matching project creates empty dir

## 2. Agent Dockerfile Changes

- [x] 2.1 Modify `generateAgentDockerfile()` in `packages/cli/src/generator/agent-dockerfile.ts` to accept `hasHome` option and emit `ARG HOST_UID=1000` / `ARG HOST_GID=1000` with `groupadd -g` / `useradd -m -u` instead of `-r` flags
- [x] 2.2 When `hasHome: true`, emit `COPY {role}/{agent}/home/ /home/mason/` and `RUN cp -a /home/mason /home/mason-from-build` after workspace COPY
- [x] 2.3 Update existing agent-dockerfile tests and add new tests for UID/GID args, home COPY, and backup step

## 3. Docker Compose Generation Changes

- [x] 3.1 Add `homePath?: string` and `hostUid?: string` / `hostGid?: string` to `SessionComposeOptions` in `packages/cli/src/materializer/docker-generator.ts`
- [x] 3.2 Emit `/home/mason` volume mount in agent service when `homePath` is provided
- [x] 3.3 Emit `HOST_UID` and `HOST_GID` build args in agent service build section
- [x] 3.4 Update existing compose generation tests and add tests for home mount and build args

## 4. Build Pipeline Integration

- [x] 4.1 Update `generateRoleDockerBuildDir()` to call `materializeHome(projectDir, homePath)` on the materializer (when method exists) and pass `hasHome` to `generateAgentDockerfile()`
- [x] 4.2 Update `createSessionDirectory()` to detect the home directory existence and pass `homePath`, `hostUid`, `hostGid` to `generateSessionComposeYml()`
- [x] 4.3 Read host `id -u` and `id -g` at build time and pass through as `hostUid`/`hostGid`

## 5. Agent Entry Home Merge

- [x] 5.1 Add `mergeHomeBuild()` function to `packages/agent-entry/src/index.ts` that copies `/home/mason-from-build/` into `/home/mason/` with no-clobber semantics
- [x] 5.2 Call `mergeHomeBuild()` at the start of `bootstrap()` before `connectToProxy()`
- [x] 5.3 Add unit tests for `mergeHomeBuild` — backup exists, backup missing, no-clobber behavior

## 6. Verification

- [x] 6.1 Run `npx tsc --noEmit` across affected packages
- [x] 6.2 Run `npx vitest run` for cli and agent-entry package tests
- [x] 6.3 Run e2e tests to verify full build → run flow (69/73 pass — 4 pre-existing timeouts in mcp-proxy-agent.test.ts)
