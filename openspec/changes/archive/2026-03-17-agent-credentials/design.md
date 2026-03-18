## Context

Credential resolution currently has two sources:
1. **Agent SDK** (`AgentPackage.runtime.credentials`) — agent-specific credentials hardcoded in the npm package (e.g., `CLAUDE_CODE_OAUTH_TOKEN` in `@clawmasons/claude-code`)
2. **Role** (`governance.credentials`) — role-level credentials declared in `ROLE.md` frontmatter

The problem: agent-specific credentials like `CLAUDE_CODE_OAUTH_TOKEN` belong to the agent, not the role, but roles are the only per-project config location available today. This forces role authors to know and repeat agent-specific credentials even though they're already declared in the SDK.

The fix: add a `credentials` field to agent entries in `.mason/config.json` so project operators can declare agent-specific credentials at the agent level, without touching roles.

The credential merge happens in two places:
- `generateAgentLaunchJson` in `packages/agent-sdk/src/helpers.ts` — builds `agent-launch.json`
- `run-agent.ts` — collects `declaredCredentialKeys` for compose generation and credential service

## Goals / Non-Goals

**Goals:**
- Add `credentials?: string[]` to `AgentEntryConfig` in `packages/agent-sdk/src/discovery.ts`
- Parse `credentials` from `.mason/config.json` agent entries (alongside existing `home`, `mode`, `role`)
- Merge agent-config credentials into the credential pipeline: SDK defaults → agent config credentials → role credentials (deduped)
- Roles retain their `governance.credentials` field — no breaking change

**Non-Goals:**
- Removing credentials from roles (roles can still declare them)
- Changing the credential service, proxy, or vault infrastructure
- Credential validation or existence checks at config parse time

## Decisions

### Decision 1: Extend `AgentEntryConfig` in `agent-sdk/src/discovery.ts`

Add `credentials?: string[]` to the `AgentEntryConfig` interface and parse it in `parseEntryConfig`. Non-string array entries are silently skipped with a warning.

**Rationale**: This is the authoritative type for agent config entries; all consumers (`loadConfigAgentEntry`, `run-agent.ts`) go through this path. Adding it here makes it available everywhere without touching shared schemas.

**Alternative considered**: Add to `packages/shared/src/schemas/`. Rejected — agent config is read by the SDK, not the shared schema layer, and would require cross-package changes for no benefit.

### Decision 2: Merge order — SDK → agent config → role

The final credential key list is:
1. `agentPkg.runtime?.credentials` (SDK hardcoded)
2. `configEntry?.credentials` (agent config, per-project additions)
3. `governance.credentials` + `app.credentials` (role-declared)

All deduplicated. Earlier entries win on key conflicts (same env var key won't be added twice).

**Rationale**: Agent defaults should come first; project-level agent config supplements them; role-level credentials are the most specific and come last (they're additive extras for a particular role's needs).

### Decision 3: Thread `configEntry` into `generateAgentLaunchJson` via existing `roleCredentials` parameter

`generateAgentLaunchJson(agentPkg, roleCredentials, ...)` already merges SDK + role credentials. The simplest change is to have the caller (`run-agent.ts`) prepend `configEntry?.credentials ?? []` into `roleCredentials` before passing it in. No signature change needed.

**Alternative considered**: Add a third `agentConfigCredentials` parameter to `generateAgentLaunchJson`. This is cleaner semantically but requires coordinating changes across more files and the SDK's exported API. Given the merge order is the same either way, prepending in the caller is simpler.

### Decision 4: Also inject agent-config credentials into `declaredCredentialKeys` in `run-agent.ts`

`declaredCredentialKeys` feeds the compose generator and credential service (what keys to pass into the container via env). It currently only reads role + app credentials. It must also include `configEntry?.credentials` so agent-config-declared credentials are available in the container.

## Risks / Trade-offs

- **Risk**: Agent config credentials silently ignored if config.json is missing → same behavior as all other config fields; acceptable.
- **Trade-off**: Prepending into `roleCredentials` hides the semantic distinction between "agent config" and "role" credentials. Acceptable for now — the distinction matters for display/audit, not correctness.

## Migration Plan

No migration required. The change is purely additive:
- Existing `.mason/config.json` files without `credentials` are unaffected
- Existing roles with `governance.credentials` continue to work
- New `credentials` entries in agent config are optional

Roles that currently specify agent-specific credentials (e.g., `CLAUDE_CODE_OAUTH_TOKEN`) can have those entries moved to the agent config block if desired, but are not required to change.
