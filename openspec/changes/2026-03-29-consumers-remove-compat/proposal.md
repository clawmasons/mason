# Proposal: Update all consumers, remove backwards-compat aliases

**Change:** CHANGE 2 from PRD `rename-apps`
**Date:** 2026-03-29
**Status:** In Progress

## Problem

After CHANGE 1 renamed types/schemas in `@clawmasons/shared` and added temporary backwards-compat aliases, all downstream packages (proxy, cli, agent-sdk, mason-extensions) still reference the old `AppConfig`, `ResolvedApp`, `UpstreamAppConfig`, `.apps`, and `mcp_servers` names. The backwards-compat aliases must be removed to complete the rename.

## Proposed Solution

1. Update all consumer packages in mason (proxy, cli, agent-sdk, mcp-agent) to use new names
2. Update all test files across both mason and mason-extensions repos
3. Update fixture ROLE.md files (`mcp_servers:` to `mcp:`)
4. Update documentation (docs/*.md, openspec specs)
5. Remove backwards-compat aliases from `@clawmasons/shared`
6. Verify zero stale references remain

## Scope

- **mason repo**: packages/proxy, packages/cli, packages/agent-sdk, packages/mcp-agent (source + tests)
- **mason-extensions repo**: agents/claude-code-agent/tests, agents/pi-coding-agent/tests, agents/codex-agent/tests
- **Fixtures**: packages/agent-sdk/fixtures/
- **Docs**: docs/role.md, docs/security.md, docs/proxy.md, docs/concepts.md
- **Specs**: openspec/specs/role-md-parser-dialect-registry/spec.md

## Success Criteria

- `rg "appConfigSchema|AppConfig[^a-z]|ResolvedApp[^a-z]|UpstreamAppConfig" --type ts` returns 0 hits
- `rg "mcp_servers" --type ts` only in parser.ts/package-reader.ts backwards-compat fallback
- All tests pass in both mason and mason-extensions repos
