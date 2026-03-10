# Proposal: `chapter init-role` Command

**Date:** 2026-03-10
**Change:** #4 from [ACP Session CWD IMPLEMENTATION](../../../prds/acp-session-cwd/IMPLEMENTATION.md)
**PRD Refs:** REQ-001 (`chapter init-role`), US-2, US-3, US-7

## Problem

After running `chapter build`, operators need a way to initialize a host-wide runtime directory for a chapter role. Currently, `run-init` creates per-project `.clawmasons/chapter.json` configs, but there's no mechanism to set up a reusable, host-wide role directory at `CLAWMASONS_HOME/<lodge>/<chapter>/<role>/` with a `docker-compose.yaml` that can be shared across projects.

## Proposal

Create `packages/cli/src/cli/commands/init-role.ts` -- a new CLI command that:

1. Reads `CLAWMASONS_HOME` via the utility from CHANGE 1 (`runtime/home.ts`)
2. Discovers packages and resolves the agent/role from the current chapter workspace
3. Determines the role directory (default `CLAWMASONS_HOME/<lodge>/<chapter>/<role>/` or `--target-dir`)
4. Generates a `docker-compose.yaml` with services for proxy, credential-service, and all agents for the role
5. Backs up existing `docker-compose.yaml` if re-running
6. Updates `chapters.json` with the role entry
7. Ensures `CLAWMASONS_HOME/.gitignore` exists

The `docker-compose.yaml` uses `${PROJECT_DIR}` environment variable substitution so it's reusable across projects. Tokens are generated fresh per session by `run-agent`/`run-acp-agent`, not baked into the compose file.

## Scope

- New file: `packages/cli/src/cli/commands/init-role.ts`
- Modified file: `packages/cli/src/cli/commands/index.ts` (register the command)
- New test: `packages/cli/tests/cli/init-role.test.ts`
