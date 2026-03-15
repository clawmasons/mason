## 1. Create `@clawmasons/agent-sdk` Package

- [ ] 1.1 Scaffold `packages/agent-sdk/` with `package.json`, `tsconfig.json`, and `src/index.ts`
- [ ] 1.2 Define `AgentPackage`, `DockerfileConfig`, `AcpConfig`, `RuntimeConfig` interfaces in `src/types.ts`
- [ ] 1.3 Move `RuntimeMaterializer`, `MaterializationResult`, `MaterializeOptions` types from `packages/cli/src/materializer/types.ts` into `src/types.ts`
- [ ] 1.4 Move helper functions from `packages/cli/src/materializer/common.ts` into `src/helpers.ts` (`generateAgentsMd`, `generateSkillReadme`, `generateAgentLaunchJson`, `generateAcpConfigJson`, `formatPermittedTools`, `collectAllSkills`, `collectAllTasks`)
- [ ] 1.5 Add re-exports of `ResolvedAgent`, `ResolvedRole`, `ResolvedTask`, `ResolvedSkill` from `@clawmasons/shared` in `src/index.ts`
- [ ] 1.6 Implement `createAgentRegistry()`, `loadConfigAgents()` in `src/discovery.ts`
- [ ] 1.7 Add `packages/agent-sdk` to monorepo workspace config
- [ ] 1.8 Write unit tests for discovery module (`packages/agent-sdk/tests/discovery.test.ts`)
- [ ] 1.9 Write unit tests for helpers (`packages/agent-sdk/tests/helpers.test.ts`)

## 2. Create `@clawmasons/claude-code` Agent Package

- [ ] 2.1 Scaffold `packages/claude-code/` with `package.json`, `tsconfig.json`, and `src/index.ts`
- [ ] 2.2 Move materializer from `packages/cli/src/materializer/claude-code.ts` to `packages/claude-code/src/materializer.ts`, update imports to use `@clawmasons/agent-sdk`
- [ ] 2.3 Create default `AgentPackage` export in `src/index.ts` with name `"claude-code"`, aliases `["claude"]`, dockerfile install steps, ACP command, and runtime config
- [ ] 2.4 Move tests from `packages/cli/tests/materializer/claude-code.test.ts` to `packages/claude-code/tests/materializer.test.ts`, update imports
- [ ] 2.5 Add `packages/claude-code` to monorepo workspace config

## 3. Create `@clawmasons/pi-coding-agent` Agent Package

- [ ] 3.1 Scaffold `packages/pi-coding-agent/` with `package.json`, `tsconfig.json`, and `src/index.ts`
- [ ] 3.2 Move materializer from `packages/cli/src/materializer/pi-coding-agent.ts` to `packages/pi-coding-agent/src/materializer.ts`, update imports to use `@clawmasons/agent-sdk`
- [ ] 3.3 Create default `AgentPackage` export in `src/index.ts` with name `"pi-coding-agent"`, aliases `["pi"]`, dockerfile install steps, ACP command, and runtime config
- [ ] 3.4 Move tests from `packages/cli/tests/materializer/pi-coding-agent.test.ts` to `packages/pi-coding-agent/tests/materializer.test.ts`, update imports
- [ ] 3.5 Add `packages/pi-coding-agent` to monorepo workspace config

## 4. Add Materializer to Existing `@clawmasons/mcp-agent` Package

- [ ] 4.1 Move materializer from `packages/cli/src/materializer/mcp-agent.ts` to `packages/mcp-agent/src/materializer.ts`, update imports to use `@clawmasons/agent-sdk`
- [ ] 4.2 Create default `AgentPackage` export in `packages/mcp-agent/src/index.ts` with name `"mcp-agent"`, aliases `["mcp"]`, ACP command, and runtime config
- [ ] 4.3 Move tests from `packages/cli/tests/materializer/mcp-agent.test.ts` to `packages/mcp-agent/tests/materializer.test.ts`, update imports
- [ ] 4.4 Add `@clawmasons/agent-sdk` as dependency in `packages/mcp-agent/package.json`

## 5. Refactor CLI to Use Agent SDK

- [ ] 5.1 Add dependencies on `@clawmasons/agent-sdk`, `@clawmasons/claude-code`, `@clawmasons/pi-coding-agent` in `packages/cli/package.json`
- [ ] 5.2 Replace `packages/cli/src/materializer/types.ts` with re-export from `@clawmasons/agent-sdk`
- [ ] 5.3 Replace `packages/cli/src/materializer/common.ts` — remove moved helpers, import from SDK; remove hardcoded `ACP_RUNTIME_COMMANDS`, `RUNTIME_COMMANDS`, `RUNTIME_CREDENTIALS` maps
- [ ] 5.4 Refactor `packages/cli/src/materializer/role-materializer.ts` — replace hardcoded registry with agent discovery registry, update `getMaterializer()` and `getRegisteredAgentTypes()` to use dynamic registry
- [ ] 5.5 Refactor `packages/cli/src/generator/agent-dockerfile.ts` — replace `getRuntimeInstall()` switch with `AgentPackage.dockerfile` config lookup; accept `AgentPackage` or its dockerfile config as parameter
- [ ] 5.6 Refactor `packages/cli/src/commands/run-agent.ts` — replace `AGENT_TYPE_ALIASES` with agent registry alias lookup
- [ ] 5.7 Remove old materializer files from CLI: `claude-code.ts`, `pi-coding-agent.ts`, `mcp-agent.ts`
- [ ] 5.8 Update `packages/cli/src/materializer/docker-generator.ts` to resolve `AgentPackage` from registry for Dockerfile generation hooks

## 6. Add `.mason/config.json` Support

- [ ] 6.1 Define config schema for `.mason/config.json` `agents` field
- [ ] 6.2 Integrate config loading into agent discovery — read `.mason/config.json` at CLI startup, dynamic-import declared packages
- [ ] 6.3 Add error handling for missing/invalid third-party agent packages (warn and skip)

## 7. Update Tests

- [ ] 7.1 Update `packages/cli/tests/materializer/role-materializer.test.ts` for SDK-based registry
- [ ] 7.2 Update `packages/cli/tests/materializer/docker-generator.test.ts` for SDK extension points
- [ ] 7.3 Update `packages/cli/tests/cli/run-agent.test.ts` for dynamic agent discovery
- [ ] 7.4 Update `packages/cli/tests/generator/agent-dockerfile.test.ts` for pluggable install steps

## 8. Verification

- [ ] 8.1 Run `npx tsc --noEmit` across all packages — no type errors
- [ ] 8.2 Run `npx eslint src/ tests/` — no lint errors
- [ ] 8.3 Run `npx vitest run` — all unit tests pass
- [ ] 8.4 Run e2e tests — all existing e2e tests pass unchanged
