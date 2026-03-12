# Proposal: Docker Generation + Container Ignore

**Change:** #7 from agent-roles IMPLEMENTATION.md
**Date:** 2026-03-12
**Status:** Proposed

## Problem

The current Docker generation (in `docker-init.ts` and the `generator/` package) is agent-centric: it generates Dockerfiles per agent x role combination, with build contexts rooted at the flat `docker/` directory. There is no role-centric Docker build directory, no volume masking for `container.ignore.paths`, no sentinel file creation, and no session directory that serves as a self-contained Docker Compose project.

The PRD (sections 7.1, 7.3, 7.4, 7.5) defines a role-centric build directory at `.clawmasons/docker/<role-name>/` with agent subdirectory, mcp-proxy subdirectory, and docker-compose.yaml. It also specifies container ignore (volume masking) so that paths like `.clawmasons/`, `.claude/`, `.env` are hidden inside the container's project mount via Docker volume stacking. Session directories must be self-contained Compose projects.

## Goal

1. Generate role-centric Docker build directories at `.clawmasons/docker/<role-name>/` matching PRD section 7.1 structure.
2. Implement volume masking for `container.ignore.paths`: directories masked with named empty volumes, files masked with read-only bind mounts of a sentinel empty file.
3. Create the sentinel file `.clawmasons/empty-file` with `chmod 444`.
4. Generate session directories at `.clawmasons/sessions/<session-id>/` with a self-contained compose file.
5. Update proxy Dockerfile generation to use `@clawmasons/proxy` from pre-populated `docker/node_modules/`.

## Approach

- Add new module `packages/cli/src/materializer/docker-generator.ts` with functions for:
  - `generateRoleDockerBuildDir()` — generates the role-centric build directory structure
  - `generateVolumeMasks()` — computes volume mask entries from ignore paths
  - `ensureSentinelFile()` — creates `.clawmasons/empty-file`
  - `generateSessionDir()` — creates session directory with compose file
- Modify `generateComposeYml()` and `generateAcpComposeYml()` to include volume masking entries
- All paths in the session compose file must be relative to the session directory

## Out of Scope

- CLI command changes (Change 8)
- Actually running containers (Change 8)
- MCP proxy runtime behavior (proxy already handles tool filtering via ToolRouter)
- E2E tests (Change 12)

## Risks

- Path resolution complexity: session compose files reference build dirs via relative paths, which must work from the session directory.
- Volume stacking order matters: ignore volumes must come after the project mount in the compose file.
