# Proposal: Enhanced `chapter build` Command

**Date:** 2026-03-10
**Change:** #3 from [ACP Session CWD IMPLEMENTATION](../../../prds/acp-session-cwd/IMPLEMENTATION.md)
**PRD Refs:** REQ-006 (`chapter build` Enhanced), REQ-007 (Remove CLI Entry Points), US-1, US-8

## Problem

After `chapter init`, getting to a runnable agent requires three separate commands: `chapter build` (lock file), `chapter pack` (tarballs), and `chapter docker-init` (Docker artifacts). This multi-step ceremony creates friction and confusion. Additionally, `docker-init`, `run-init`, and `acp-proxy` are exposed as CLI commands when they should be internal or renamed.

## Proposal

Enhance the existing `build` command to consolidate the full pipeline:

1. **Make `<agent>` argument optional** -- auto-detect when only one agent exists, build all agents when multiple exist
2. **Run `pack` logic** after lock file generation to create `dist/*.tgz`
3. **Run `docker-init` logic** to copy framework packages, extract tgz, generate Dockerfiles, materialize workspaces
4. **Display completion instructions** showing how to run agents interactively and configure an ACP client
5. **Remove CLI entry points** for `docker-init`, `run-init`, and `acp-proxy` (internal functions remain importable)

## Scope

- Modified: `packages/cli/src/cli/commands/build.ts` (enhanced pipeline)
- Modified: `packages/cli/src/cli/commands/index.ts` (remove command registrations)
- Modified: `packages/cli/tests/cli/build.test.ts` (updated tests)
- Modified: `packages/cli/tests/cli/docker-init.test.ts` (remove command registration test)
- Unchanged (internal API): `docker-init.ts`, `run-init.ts`, `acp-proxy.ts`, `docker-utils.ts`
