# Proposal: Docker Generator Copies Channel Bundle into Build Context

**Change:** CHANGE 5 from PRD `role-channels`
**Date:** 2026-04-12
**Status:** In Progress

## Problem

When a role specifies a `channel` (e.g., `channel: slack`), the Docker container needs the channel MCP server bundle at `/home/mason/channels/{type}/server.js`. Currently, the docker-generator has no logic to resolve the channel bundle from the agent package and copy it into the Docker build context.

Changes 2 and 3 (MCP server package and esbuild bundle) have not been implemented yet, so the actual bundle file does not exist. However, the docker-generator logic to resolve and copy it should be implemented now so that once the bundle is available, the pipeline works end-to-end.

## Proposed Solution

1. Add a `copyChannelBundle()` function to `packages/cli/src/materializer/proxy-dependencies.ts` that:
   - Takes the docker build dir, role channel config, and agent type
   - Uses `createRequire(import.meta.url).resolve()` to find the channel bundle from the agent package exports (e.g., `@clawmasons/claude-code-agent/channels/slack`)
   - Copies the resolved bundle to `{agentDir}/home/channels/{type}/server.js`
   - Warns and returns gracefully if resolution fails (the bundle doesn't exist yet)

2. Call `copyChannelBundle()` from both `build.ts` and `run-agent.ts` after `generateRoleDockerBuildDir()`, passing the role's channel config.

3. No Dockerfile changes needed -- the existing `COPY --chown=mason:mason {role}/{agent}/home/ /home/mason/` instruction in `agent-dockerfile.ts` already covers the `channels/` subdirectory.

## Scope

- **Modify**: `packages/cli/src/materializer/proxy-dependencies.ts` -- Add `copyChannelBundle()` function
- **Modify**: `packages/cli/src/cli/commands/build.ts` -- Call `copyChannelBundle()` per role
- **Modify**: `packages/cli/src/cli/commands/run-agent.ts` -- Call `copyChannelBundle()` per role
- **Add tests**: `packages/cli/tests/materializer/docker-generator.test.ts` -- Channel bundle tests

## Test Plan

- Role with `channel.type: slack` -- build context contains `{role}/{agent}/home/channels/slack/server.js`
- Role without channel -- no `channels/` directory in build context
- Missing channel bundle (resolution fails) -- warning logged, build continues
- `copyChannelBundle()` is idempotent -- does not re-copy if already present

## PRD References

- REQ-007: Dockerfile Copies Channels Directory

## Dependencies

- CHANGE 1 (merged): `channel` field on Role schema, parser, adapter, ResolvedRole
- CHANGE 2 (not yet): MCP server package -- bundle file won't resolve until this is done
- CHANGE 3 (not yet): esbuild bundle -- the actual `dist/channels/slack/server.js` in the agent package
