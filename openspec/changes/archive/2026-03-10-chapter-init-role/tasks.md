# Tasks: `chapter init-role` Command

**Date:** 2026-03-10

## Completed

- [x] Create `packages/cli/src/cli/commands/init-role.ts`
- [x] Implement `resolveAgentsForRole()` -- find all agents that have the specified role
- [x] Implement `generateInitRoleComposeYml()` -- generate docker-compose.yaml with env var substitution
- [x] Implement `initRole()` -- main orchestrator function
- [x] Register `init-role` command in `packages/cli/src/cli/commands/index.ts`
- [x] Create `packages/cli/tests/cli/init-role.test.ts`
- [x] Test: command is registered
- [x] Test: `resolveAgentsForRole` finds agents with matching role
- [x] Test: `resolveAgentsForRole` throws when role not found
- [x] Test: `resolveAgentsForRole` respects `--agent` filter
- [x] Test: `generateInitRoleComposeYml` generates correct YAML with env var substitution
- [x] Test: `generateInitRoleComposeYml` includes multiple agents for same role
- [x] Test: `initRole` creates role directory and docker-compose.yaml
- [x] Test: `initRole` updates `chapters.json`
- [x] Test: `initRole` with `--target-dir` uses custom path
- [x] Test: `initRole` backs up existing docker-compose.yaml
- [x] Test: `initRole` creates logs directory
- [x] Test: `initRole` ensures CLAWMASONS_HOME/.gitignore exists
- [x] Verify type check passes (`npx tsc --noEmit`)
- [x] Verify lint passes (`npx eslint src/ tests/`)
- [x] Verify all tests pass (`npx vitest run`) -- 965 tests passing (18 new)
