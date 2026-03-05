## Why

The proxy Dockerfile currently uses a multi-stage build that copies the entire forge source tree into a builder stage, runs `npm ci --ignore-scripts && npm run build` to compile TypeScript, then copies the build artifacts to the runtime image. This is slow, fragile, and unnecessary -- by the time a user runs `forge install`, they already have a fully built copy of `@clawforge/forge` in their `node_modules`. The Dockerfile should simply copy the pre-built package instead of recompiling from source.

Similarly, `runInstall()` in the install command copies forge source files (`src/`, `tsconfig*.json`) into the build context for the Docker build. With a pre-built Dockerfile, these source copies are replaced by copying the installed forge package (dist, bin, node_modules, package.json) from `node_modules/@clawforge/forge/`.

## What Changes

- Rewrite `generateProxyDockerfile()` in `src/generator/proxy-dockerfile.ts` to produce a single-stage Dockerfile (no `AS builder`, no `npm ci`, no `npm run build`)
- Update `runInstall()` in `src/cli/commands/install.ts` to copy pre-built forge from `node_modules/@clawforge/forge/` (dist, bin, node_modules, package.json) instead of copying source files (src/, tsconfig*.json)
- Update entrypoint path from `/app/bin/forge.js` to `/app/forge/bin/forge.js` (forge is now nested under `forge/` in the image)
- Update tests to match the new single-stage Dockerfile expectations

## Capabilities

### Modified Capabilities
- `docker-install-pipeline`: The proxy Dockerfile generation and install command's build context assembly are updated to use pre-built forge from node_modules instead of building from source.

## Impact

- **`src/generator/proxy-dockerfile.ts`**: Entire Dockerfile template rewritten -- single-stage, no builder
- **`src/cli/commands/install.ts`**: The forge build context section is rewritten -- copies pre-built package instead of source files. The `copyDirToFiles()` helper remains for workspace directory copying but the forge source calls are removed.
- **`tests/generator/proxy-dockerfile.test.ts`**: All test expectations updated for single-stage Dockerfile
- **`tests/cli/install.test.ts`**: Test for "copies forge source" updated to verify pre-built dist instead of source
- **Docker build time**: Eliminated TypeScript compilation stage -- faster, simpler builds
