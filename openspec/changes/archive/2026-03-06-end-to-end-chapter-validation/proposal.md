# Proposal: End-to-End Validation -- Full Chapter Workflow

## Problem

Changes #1-#10 have systematically rebuilt the codebase from forge to chapter, introducing member types, per-member directories, a members registry, and enable/disable commands. However, there is no single integration test that exercises the complete chapter lifecycle from init to install to enable/disable in one continuous flow. The existing `install-flow.test.ts` covers init through install but does not verify the members registry, enable/disable commands, or forge-remnant checks.

## Solution

Extend the existing E2E integration test (`tests/integration/install-flow.test.ts`) with additional steps that exercise the full chapter workflow:
1. Verify the members registry (`.chapter/members.json`) is created and correct after install
2. Test `chapter disable @<member>` sets status to disabled
3. Test `chapter run` rejects disabled members
4. Test `chapter enable @<member>` re-enables the member
5. Verify no "forge" references leak into any generated files

Also update the existing install-flow spec and create a new e2e-chapter-workflow spec.

## PRD References

- **PRD Section 11, Phase 5:** End-to-End Validation
- **REQ-006:** Members Registry
- **REQ-007:** `chapter enable` / `chapter disable` Commands
- **REQ-008:** Per-Member Directory Structure

## Acceptance Criteria (from PRD)

1. Integration tests pass for the full sequence: init -> validate -> list -> install -> verify per-member dirs -> verify members.json -> disable -> verify run rejects -> enable
2. Generated files contain no "forge" references
3. All tests pass (including existing tests)

## Scope

- Modify: `tests/integration/install-flow.test.ts` -- add steps 6-10 for registry, enable/disable, and forge-remnant checks
- New/updated spec: `openspec/specs/e2e-chapter-workflow/spec.md` -- end-to-end workflow integration test spec
- Update: `openspec/specs/install-command/spec.md` -- add E2E integration test requirement (if needed)

## Out of Scope

- Docker runtime tests (require Docker daemon)
- Proxy integration tests (covered by separate chapter-proxy.test.ts)
- Human member E2E (would need a human member template)
