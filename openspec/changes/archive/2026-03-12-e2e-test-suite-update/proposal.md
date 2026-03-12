# Proposal: End-to-End Test Suite Update

**Change:** #12 from [IMPLEMENTATION.md](../../../prds/agent-roles/IMPLEMENTATION.md)
**PRD:** [Agent Roles](../../../prds/agent-roles/PRD.md)
**PRD refs:** §12 (Use Cases -- UC-1 through UC-6)
**Date:** 2026-03-12

## Problem

The existing e2e test suite was written for the old agent-centric pipeline. With the role-based pipeline now fully operational (Changes 1-11), the e2e tests need to:

1. Replace deprecated `clawmasons agent` invocations with `clawmasons run`
2. Exercise the new role-based workflow: ROLE.md -> materialize -> run
3. Test cross-agent materialization (Claude role -> Codex output)
4. Test volume masking and container ignore
5. Test session directory operability
6. Test error paths (missing role, malformed ROLE.md, uninstalled package role)
7. Remove tests that exercise deprecated agent package workflows

## Proposed Solution

1. **Update existing tests** -- Replace `clawmasons agent` with `clawmasons run` in the ACP bootstrap test
2. **Add new role-based test fixtures** -- Create ROLE.md-based fixtures in `.claude/roles/` for the test workspace
3. **Add role workflow tests** -- Test `chapter build`, `chapter list`, `chapter validate` with role-based discovery
4. **Add cross-agent materialization tests** -- Materialize a Claude-dialect role for Codex output
5. **Add volume masking tests** -- Test container ignore path generation
6. **Add error path tests** -- Missing roles, malformed ROLE.md, missing packaged roles
7. **Keep working Docker tests** -- The existing Docker-based tests (build-pipeline, docker-proxy, test-note-taker-mcp) still exercise the build and Docker pipeline correctly through the role-based pipeline

## Scope

### Files to modify
- `e2e/tests/acp-client-spawn.test.ts` -- Update `clawmasons agent` to `clawmasons run`
- `e2e/tests/helpers.ts` -- Add helper for running clawmasons commands expecting failure

### Files to create
- `e2e/tests/role-workflow.test.ts` -- Local role development, list, validate, build
- `e2e/tests/cross-agent-materialization.test.ts` -- Cross-agent role materialization
- `e2e/tests/volume-masking.test.ts` -- Container ignore / volume masking
- `e2e/tests/error-paths.test.ts` -- Error handling for missing/malformed roles
- `e2e/fixtures/test-chapter/.claude/roles/test-writer/ROLE.md` -- Local ROLE.md fixture

## Risk

LOW -- This is a test-only change. No production code is modified. All existing tests continue to work.
