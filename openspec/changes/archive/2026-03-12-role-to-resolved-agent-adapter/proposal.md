# Proposal: RoleType-to-ResolvedAgent Adapter

## Problem

The new ROLE_TYPES pipeline produces `RoleType` objects, but existing materializers (`claude-code`, `codex`, `mcp-agent`, `pi-coding-agent`) all accept `ResolvedAgent`. Without a bridge, adopting the new pipeline requires rewriting every materializer simultaneously — a risky big-bang migration.

## Solution

Create a stateless adapter function `adaptRoleToResolvedAgent(role: RoleType, agentType: string): ResolvedAgent` that converts a `RoleType` into the `ResolvedAgent` shape materializers already accept. This is the key migration bridge:

- `metadata` → `name`, `version`, `agentName`, `slug`, `description`
- `tasks` → `ResolvedTask[]` (mapped to the dialect's task field via `agentType`)
- `apps` → `ResolvedApp[]` (MCP server configs)
- `skills` → `ResolvedSkill[]`
- `container` → `ResolvedRole.mounts`, `ResolvedRole.aptPackages`, `ResolvedRole.baseImage`
- `governance` → `ResolvedRole.risk`, `ResolvedRole.constraints`, `ResolvedAgent.credentials`
- `instructions` → task prompts and agent description

The `agentType` parameter selects the dialect for reverse-mapping (e.g., `"claude-code"` emits `commands` semantics).

## Scope

- New file: `packages/shared/src/role/adapter.ts`
- New test: `packages/shared/tests/role-adapter.test.ts`
- Export from `packages/shared/src/role/index.ts` and `packages/shared/src/index.ts`

## Success Criteria

- Adapter produces valid `ResolvedAgent` from any well-formed `RoleType`
- Round-trip: ROLE.md -> RoleType -> ResolvedAgent preserves all fields materializers need
- Each agent dialect (claude-code, codex, aider) produces correct output
- `npx tsc --noEmit` compiles
- `npx vitest run` passes
