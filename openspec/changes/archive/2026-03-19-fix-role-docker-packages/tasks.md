## 1. Type System

- [x] 1.1 Add `npmPackages?: string[]` to `ResolvedRole` interface in `packages/shared/src/types.ts`
- [x] 1.2 Add `npmPackages?: string[]` to `DockerfileConfig` interface in `packages/agent-sdk/src/types.ts`

## 2. Adapter — npm Package Mapping

- [x] 2.1 In `packages/shared/src/role/adapter.ts` `buildResolvedRole()`, map `role.container.packages?.npm` to `resolvedRole.npmPackages` (same pattern as `aptPackages`, skip when empty)
- [x] 2.2 Add adapter unit tests in `packages/shared/tests/role-adapter.test.ts`: npm packages mapped, empty array omitted, absent field leaves unset

## 3. Dockerfile Generator — npm Install Step

- [x] 3.1 In `packages/cli/src/generator/agent-dockerfile.ts`, merge `dockerfileConfig?.npmPackages` and `role.npmPackages` with dedup (same pattern as `allAptPackages`)
- [x] 3.2 Emit `RUN npm install -g <packages>` step when `uniqueNpmPackages.length > 0`, placed after `aptInstallStep` and before the `groupadd`/user creation block
- [x] 3.3 Add Dockerfile generator tests in `packages/cli/tests/generator/agent-dockerfile.test.ts`: npm packages from role, merged from agent+role, deduped, absent when none declared, ordering (after apt, before user creation)

## 4. Build Invalidation — packages-hash

- [x] 4.1 In `packages/cli/src/cli/commands/run-agent.ts` `ensureDockerBuildArtifacts()`, after the existence check, compute SHA-256 of `JSON.stringify(role.container?.packages ?? {})` and compare against `{buildDir}/{agentType}/.packages-hash`
- [x] 4.2 When hash differs or file is absent: delete `dockerBuildDir`, log stale-hash message, fall through to regeneration
- [x] 4.3 After `generateRoleDockerBuildDir()` completes, write the new hash to `{buildDir}/{agentType}/.packages-hash`
- [x] 4.4 Add unit tests in `packages/cli/tests/cli/run-agent.test.ts`: hash match skips rebuild, hash mismatch triggers rebuild, missing hash triggers rebuild, hash written after build

## 5. Verification

- [x] 5.1 Run `npx tsc --noEmit` from repo root — must pass with no errors
- [x] 5.2 Run `npx eslint src/ tests/` in `packages/shared` — must pass
- [x] 5.3 Run `npx vitest run packages/shared/tests/` — all tests pass
- [x] 5.4 Run `npx eslint src/ tests/` in `packages/cli` — must pass
- [x] 5.5 Run `npx vitest run packages/cli/tests/` — all tests pass
