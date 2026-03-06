# Proposal: Per-Member Directory Structure & Install Pipeline

**Change:** #6 from chapter-members IMPLEMENTATION.md
**PRD refs:** REQ-008 (Per-Member Directory Structure)
**Date:** 2026-03-06

## Problem

The current install pipeline scaffolds agent member directories under `.chapter/members/<short-name>/` but uses a flat layout with all artifacts (docker-compose, env, lock, proxy build context, runtime workspaces) at the root of the member directory. It also:

1. Does not create a `log/` directory for activity tracking
2. Does not create a `proxy/` directory scoped to the member (uses `chapter-proxy/` at the member root instead)
3. Uses `getAppShortName(member.name)` for directory naming instead of the member's `slug` field
4. Does not handle human member installs (they should only get `log/`, not docker artifacts)

## Proposed Solution

Update the install pipeline to:

1. **Use `member.slug` for directory naming** -- The member schema has a `slug` field that is the canonical directory name. Use it instead of deriving from the package name.

2. **Create `log/` directory** for all members (human and agent). This is the activity log location per PRD section 5.3.

3. **Create `proxy/` directory** for agent members. This replaces the `chapter-proxy/` directory name. The proxy build context and Dockerfile go into `.chapter/members/<slug>/proxy/` instead of `.chapter/members/<slug>/chapter-proxy/`.

4. **Handle human member installs** -- When `memberType === "human"`, only create the `log/` directory. Skip docker artifact generation (compose, env, lock, proxy, runtimes).

5. **Update `resolveMemberDir()`** to use slug-based paths, maintaining backward compatibility via the `--output-dir` escape hatch.

6. **Update run/stop commands** to resolve per-member directories using the same slug-based convention.

## Scope

### Source files modified
- `src/cli/commands/install.ts` -- Use slug for directory naming, create log/ dir, handle human members, rename chapter-proxy → proxy
- `src/cli/commands/docker-utils.ts` -- Update `resolveMemberDir()` to use slug when available
- `src/cli/commands/run.ts` -- No structural changes needed (already uses `resolveMemberDir`)
- `src/cli/commands/stop.ts` -- No structural changes needed (already uses `resolveMemberDir`)
- `src/compose/docker-compose.ts` -- Update `chapter-proxy` build path to `proxy`
- `src/materializer/claude-code.ts` -- No changes needed (relative paths still work)

### Test files modified
- `tests/cli/install.test.ts` -- Update assertions for new directory structure, add human member tests
- `tests/cli/docker-utils.test.ts` -- No changes needed (slug not yet available at this layer)
- `tests/cli/run.test.ts` -- Update setup helpers if path conventions changed
- `tests/cli/stop.test.ts` -- Update setup helpers if path conventions changed
- `tests/compose/docker-compose.test.ts` -- Update proxy build path assertions

### Spec files updated
- `openspec/specs/forge-install-command/spec.md` -- Per-member layout, log/ dir, human member handling
- `openspec/specs/docker-install-pipeline/spec.md` -- proxy/ replaces chapter-proxy/
- `openspec/specs/docker-compose-generation/spec.md` -- build path update
- `openspec/specs/run-command/spec.md` -- .chapter/members/<slug>/ path references
- `openspec/specs/stop-command/spec.md` -- .chapter/members/<slug>/ path references

## Acceptance Criteria

1. `chapter install @member-note-taker` (slug: `note-taker`) creates `.chapter/members/note-taker/log/`
2. Agent member install creates `.chapter/members/note-taker/proxy/`, `.chapter/members/note-taker/claude-code/workspace/`
3. Human member install creates `.chapter/members/alice/log/` but no `proxy/` or runtime directories
4. Docker compose references `build: ./proxy` instead of `build: ./chapter-proxy`
5. All existing tests pass with updated assertions
6. `chapter run` and `chapter stop` continue to work with per-member paths
