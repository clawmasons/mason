## Why

The `chapter docker-init` command expects `.tgz` files in `dist/` but there's no automated way to create them. Running `npm pack` manually only produces a single `.tgz` in the root directory. Users need a `chapter pack` command that builds and packs all workspace packages into `dist/` so the docker pipeline works end-to-end.

## What Changes

- Add a new `chapter pack` CLI command that builds the project, then runs `npm pack` for each workspace package with `--pack-destination dist/`
- The command cleans `dist/*.tgz` before packing to avoid stale artifacts
- Integrates naturally into the workflow: `chapter pack` → `chapter docker-init`

## Capabilities

### New Capabilities
- `pack-command`: CLI command to build and pack all workspace packages into `dist/` as `.tgz` files for downstream Docker consumption

### Modified Capabilities

## Impact

- New file: `packages/cli/src/cli/commands/pack.ts`
- Modified: `packages/cli/src/cli/commands/index.ts` (register new command)
- Modified: `docker-init.ts` error message can reference `chapter pack` instead of manual steps
- No breaking changes to existing commands or APIs
