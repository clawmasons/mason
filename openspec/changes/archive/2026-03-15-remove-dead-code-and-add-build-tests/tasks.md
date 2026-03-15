## 1. Remove Deprecated Exports from run-agent.ts

- [x] 1.1 Delete `RunAcpAgentOptions` interface (~lines 52-56)
- [x] 1.2 Delete `registerRunAgentCommand` function (~lines 540-545)
- [x] 1.3 Delete `registerRunAcpAgentCommand` function (~lines 547-553)
- [x] 1.4 Delete `runAcpAgent` function and its JSDoc (~lines 586-600)
- [x] 1.5 Run `npx tsc --noEmit` to confirm no type errors
- [x] 1.6 Run `npx eslint src/` to confirm no lint errors (pre-existing errors in bridge.ts unrelated to this change; run-agent.ts is clean)
- [x] 1.7 Run `npx vitest run` to confirm existing tests still pass

## 2. Add Unit Tests for chapter build

- [x] 2.1 Create `packages/cli/tests/cli/build.test.ts` with vi.mock setup for `discoverRoles`, `generateRoleDockerBuildDir`, `ensureProxyDependencies`, `synthesizeRolePackages`, `adaptRoleToResolvedAgent`, and `fs`
- [x] 2.2 Add test: exits with code 1 when no roles discovered
- [x] 2.3 Add test: exits with code 1 when named role not found, shows available roles
- [x] 2.4 Add test: builds only matching role when name filter provided
- [x] 2.5 Add test: exits with code 1 when adapter validation throws
- [x] 2.6 Add test: calls Docker generator, proxy deps, and package synthesis for all roles on success
- [x] 2.7 Add test: uses `agentTypeOverride` instead of inferred agent type when provided
- [x] 2.8 Run `npx vitest run` to confirm all new tests pass
