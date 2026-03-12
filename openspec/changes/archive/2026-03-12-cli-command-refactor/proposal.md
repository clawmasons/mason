# Proposal: CLI Command Refactor

**Change:** #8 from agent-roles IMPLEMENTATION.md
**Date:** 2026-03-12
**Status:** Proposed

## Problem

The CLI currently uses `clawmasons agent <agent-name> <role-name>` as the primary command for running agents. This requires an `agent` package type wrapper around roles, adding unnecessary indirection. The `chapter list` command shows agents and their dependency trees, not roles. There is no role-centric CLI surface — users must think in terms of agents rather than roles.

With Changes 1-7 implementing the ROLE_TYPES pipeline (parser, adapter, discovery, materializer, Docker generation), the CLI needs to be refactored to use `clawmasons run <agent-type> --role <name>` as the primary command structure, replacing the `agent` command with `run` and making roles the first-class CLI entity.

## Goal

1. Replace the `agent` CLI command with a `run` command that takes agent type as a positional arg and `--role` flag.
2. Implement shorthand: `clawmasons claude --role x` -> `clawmasons run claude --role x`.
3. Update startup sequence to use the ROLE_TYPES pipeline (discover -> load -> materialize -> session -> run).
4. Update `chapter list` to discover and display roles (not agents).
5. Update `chapter build` to materialize Docker dirs for discovered roles.
6. Add `chapter validate` support for role definitions.
7. Produce clear error messages when packaged roles are not installed (no auto-install).

## Approach

- Rename the `agent` command registration to `run` in `run-agent.ts`, changing positional args to `<agent-type>` and `--role <name>`.
- Add agent type shorthand detection in `index.ts` by checking unknown top-level commands against the registered agent types from `getRegisteredAgentTypes()`.
- Refactor the `runAgent` startup to use `resolveRole()` + `materializeForAgent()` from the ROLE_TYPES pipeline.
- Rewrite `list.ts` to use `discoverRoles()` and display role trees.
- Update `validate.ts` to accept a role name and validate role definitions.
- Keep backward compatibility for ACP mode (`--acp` flag).

## Risks

- Breaking existing ACP client configurations that use `agent --acp` syntax (mitigated by keeping backward compat during transition).
- Tests that check for `agent` command registration need updating.

## Out of Scope

- Removing the `agent` package type from schemas (Change 11).
- E2E test updates (Change 12).
- Documentation updates (Change 13).
