# Proposal: Materializer Refactor — Accept RoleType Input

**Change:** #6 from agent-roles IMPLEMENTATION.md
**Date:** 2026-03-12
**Status:** Proposed

## Problem

The existing materializer entry points (`RuntimeMaterializer.materializeWorkspace`) accept only `ResolvedAgent` as input. This ties them exclusively to the old package-resolver pipeline. With the new ROLE_TYPES pipeline (Changes 1-5), we need materializers to also accept `RoleType` as input, enabling the new `ROLE.md -> ROLE_TYPES -> materialize` workflow.

## Goal

Add a `materializeForAgent(role: RoleType, agentType: string)` orchestration function that:
1. Accepts a `RoleType` from the new pipeline
2. Calls `adaptRoleToResolvedAgent()` (Change 4) to convert to `ResolvedAgent`
3. Selects the correct materializer based on `agentType`
4. Invokes the materializer's existing `materializeWorkspace()` logic
5. Returns the `MaterializationResult`

This is a thin wiring change. The generation logic inside each materializer does not change.

## Approach

- Add a `materializeForAgent()` function in `packages/cli/src/materializer/role-materializer.ts`
- Create a materializer registry that maps agent type strings to `RuntimeMaterializer` instances
- The function composes the adapter (from `@clawmasons/shared`) with the materializer lookup
- Export from the materializer index

## Out of Scope

- Modifying the individual materializer generation logic
- Docker build directory generation (Change 7)
- CLI command changes (Change 8)
