## Why

`container.packages` in a role's ROLE.md frontmatter is not reliably installed in the Docker container for two separate reasons: (1) the build cache is never invalidated when ROLE.md changes, so adding packages to an existing role requires a manual `--build` flag that users may not know about; and (2) `container.packages.npm` has zero code path — it is parsed but the adapter, types, and Dockerfile generator have no support for it, so npm packages are silently dropped regardless of cache state.

## What Changes

- **Stale build invalidation**: Store a content hash of the role's `container.packages` block in the build directory; on each `mason run`, compare the hash and trigger a rebuild automatically if it has changed (instead of requiring the user to pass `--build`)
- **npm package support**: Add `npmPackages?: string[]` to `ResolvedRole`; map `role.container.packages.npm` in the adapter; emit `RUN npm install -g <packages>` in `generateAgentDockerfile()` when npm packages are declared
- Add `npmPackages?: string[]` to `DockerfileConfig` in `@clawmasons/agent-sdk` (parity with `aptPackages`) so agent packages can also declare global npm installs, merged with role-level npm packages

## Capabilities

### New Capabilities
- `role-docker-npm-packages`: Role-declared `container.packages.npm` entries are installed via `npm install -g` in the generated agent Dockerfile

### Modified Capabilities
- `agent-dockerfile`: Extended to handle npm package installation from role and agent `dockerfileConfig` declarations (merged + deduplicated, same pattern as `aptPackages`)
- `build-command`: Build artifact invalidation logic updated to hash `container.packages` and auto-regenerate when changed, eliminating silent stale-cache failures

## Impact

- `packages/shared/src/types.ts` — `ResolvedRole.npmPackages` field
- `packages/shared/src/role/adapter.ts` — npm package mapping
- `packages/cli/src/generator/agent-dockerfile.ts` — `npm install -g` emit logic
- `packages/agent-sdk/src/types.ts` — `DockerfileConfig.npmPackages` field
- `packages/cli/src/cli/commands/run-agent.ts` — invalidation hash check in `ensureDockerBuildArtifacts`
- Tests: `packages/shared/tests/role-adapter.test.ts`, `packages/cli/tests/generator/agent-dockerfile.test.ts`, `packages/cli/tests/cli/run-agent.test.ts`
