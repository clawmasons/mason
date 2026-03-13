# Proposal: Dead Code Removal and Spec Cleanup

**Change:** #11 from [IMPLEMENTATION.md](../../../prds/agent-roles/IMPLEMENTATION.md)
**PRD:** [Agent Roles](../../../prds/agent-roles/PRD.md)
**PRD refs:** §9.3 (Package Type Changes), §3 (Design Principles)
**Date:** 2026-03-12

## Problem

With the role-based pipeline fully operational (Changes 1-10), the codebase still contains remnants of the deprecated `agent` package type:

1. The `chapter.type` enum includes `"agent"` as a valid value
2. The `agent.ts` schema file defines the `AgentChapterField` schema
3. Several CLI commands scan for `chapter.type === "agent"` packages to auto-detect agents
4. Spec files in `openspec/` reference the deprecated `agent` package type and `clawmasons agent` command
5. The `resolveAgent` function in `resolve.ts` asserts `type === "agent"` on packages

## Proposed Solution

1. **Remove `agent` from `chapter.type` enum** — Delete `agent.ts` schema, remove from `chapter-field.ts` enum and discriminator map, remove exports from `index.ts` files
2. **Remove agent-specific test files** — Delete `member.test.ts` (tests the agent schema)
3. **Update commands that scan for `type === "agent"`** — `build`, `proxy`, `docker-init`, `init-role`, `run-agent`, `permissions`, `validate` commands currently look for agent packages; these should fall back to explicit `--agent` flags or use role-based discovery
4. **Keep `resolveAgent` and `ResolvedAgent`** — These are still used by the active pipeline (build, proxy, run ACP mode). The function remains but the `assertType(pkg, "agent")` check is removed — callers construct `ResolvedAgent` objects differently
5. **Update spec files** — Replace agent package references with role references in affected spec files
6. **Add tests** — Verify `chapter.type = "agent"` is rejected by schema validation

## Scope

### Files to modify
- `packages/shared/src/schemas/chapter-field.ts` — Remove `agent` from enum and schemasByType
- `packages/shared/src/schemas/index.ts` — Remove agent exports
- `packages/shared/src/index.ts` — Remove agent exports
- `packages/cli/src/index.ts` — Remove agent exports
- `packages/cli/src/resolver/resolve.ts` — Remove `resolveAgent` function
- `packages/cli/src/resolver/index.ts` — Remove `resolveAgent` export
- `packages/cli/src/cli/commands/build.ts` — Remove agent package scanning, use role discovery
- `packages/cli/src/cli/commands/proxy.ts` — Remove agent package auto-detect
- `packages/cli/src/cli/commands/run-agent.ts` — Remove `resolveAgentName` agent scanning, remove hidden `agent` command
- `packages/cli/src/cli/commands/docker-init.ts` — Remove agent package scanning
- `packages/cli/src/cli/commands/init-role.ts` — Remove agent package scanning
- `packages/cli/src/cli/commands/validate.ts` — Remove agent fallback
- `packages/cli/src/cli/commands/permissions.ts` — Remove agent resolution
- 9 spec files in `openspec/specs/`

### Files to delete
- `packages/shared/src/schemas/agent.ts`
- `packages/cli/tests/schemas/member.test.ts` (tests the agent schema)

### Files to add
- `packages/cli/tests/schemas/dead-code-removal.test.ts` — Verify agent type rejection

## Risk Assessment

**Medium risk** — The `resolveAgent` function is actively used by build, proxy, docker-init, permissions, validate, init-role, and run-agent ACP mode. These commands currently depend on discovering `chapter.type === "agent"` packages. Removing the agent type from the schema means these code paths need updating.

The key insight: since Changes 1-10 introduced the role-based pipeline, these commands should transition to using roles. However, some (like `build` and `proxy`) still rely on the old agent package resolver for constructing `ResolvedAgent`. For these, we keep `ResolvedAgent` as a type but remove the ability to create packages with `chapter.type === "agent"`.
