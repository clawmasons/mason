# Proposal: Dynamic Dialect Self-Registration

**Spec:** dynamic-dialect-registration
**PRD:** agent-config — Change #5
**Date:** 2026-03-22
**Status:** Proposed

---

## Problem

The dialect registry (`packages/shared/src/role/dialect-registry.ts`) contains hardcoded entries for every agent runtime (claude-code-agent, codex, aider, mcp-agent, pi-coding-agent). Adding or removing an agent requires editing the registry source code. There is also a duplicate `pi-coding-agent` registration (lines 155-193 duplicate lines 145-173).

This violates the PRD goal G-5 (Agent-agnostic CLI) and design principle "Agent-SDK as the single contract" — agents should self-declare their dialect via `AgentPackage.dialect` rather than requiring central registry edits.

## Goal

Replace hardcoded agent-specific dialect entries with dynamic registration driven by `AgentPackage.dialect`. The canonical `mason` dialect remains static (it is agent-agnostic). After this change, adding a new agent with dialect support requires only setting `dialect` on the `AgentPackage` export — no dialect registry source changes needed.

## Approach

1. **Add `dialect` field to agent packages** — Set `dialect: "claude"` on claude-code-agent, `dialect: "pi"` on pi-coding-agent, and `dialect: "mcp"` on mcp-agent. Codex and aider remain static since they have no `AgentPackage` (they are third-party runtimes without packages in this monorepo).

2. **Add `registerAgentDialect()` function** — New exported function in `dialect-registry.ts` that takes an `AgentPackage` and derives a `DialectEntry` from its `name`, `dialect`, `tasks`, and `skills` fields. The field mapping uses sensible defaults based on existing patterns.

3. **Wire into `createAgentRegistry()`** — After registering agents in the agent registry, call `registerAgentDialect()` for each agent that declares a `dialect` field. This happens in `initRegistry()` in `role-materializer.ts`.

4. **Remove hardcoded agent-specific entries** — Remove the `claude-code-agent`, `mcp-agent`, and `pi-coding-agent` (and duplicate) static `registerDialect()` calls. Keep `mason`, `codex`, and `aider` as static entries.

5. **Add field mapping to AgentPackage** — Since different agents use different frontmatter field names (e.g., claude uses "commands", pi uses "prompts"), add an optional `dialectFieldMapping` to `AgentPackage` or derive it from the agent's task config.

## Scope

**In scope:**
- `registerAgentDialect()` function in `packages/shared/src/role/dialect-registry.ts`
- `dialect` field on claude-code-agent, pi-coding-agent, mcp-agent packages
- Wiring in `initRegistry()` / `createAgentRegistry()`
- Remove hardcoded claude/pi/mcp dialect entries
- Remove duplicate pi-coding-agent registration
- Unit tests for `registerAgentDialect()` and dynamic registration

**Out of scope:**
- Codex and aider dialect entries (no AgentPackage in this monorepo)
- Changes to the `mason` static dialect
- Config-declared (third-party) agent dialect registration (future enhancement)

## Risks

- **Field mapping derivation** — Different agents use different frontmatter names for tasks. Need a way for agents to specify their field mapping. Mitigated by adding `dialectFieldMapping` to `AgentPackage` or using the task config's folder name as a heuristic.
- **Test breakage** — Existing tests assert specific dialect entries. Will need to update tests to either register agents first or test dynamic registration separately.
