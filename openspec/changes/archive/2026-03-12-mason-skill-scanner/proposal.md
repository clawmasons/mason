# Proposal: Mason Skill — Project Scanner and ROLE.md Proposer

**Change:** #9 from agent-roles IMPLEMENTATION.md
**Date:** 2026-03-12
**Status:** Proposed

## Problem

Users with existing Claude Code setups (skills, commands, MCP servers, CLI tools) have no automated way to capture their current configuration as a portable ROLE.md. Converting an existing project setup into a role definition requires manually inventorying all configuration, understanding the ROLE.md frontmatter schema, and correctly translating agent-specific settings to the right format. This is tedious and error-prone.

With Changes 1-8 establishing the complete ROLE_TYPES pipeline (parser, adapter, discovery, materializer, Docker generation, CLI), users need a tool that bridges the gap between "existing project configuration" and "portable ROLE.md definition."

## Goal

1. Create a `skills/mason/SKILL.md` skill definition for project analysis and ROLE.md proposal.
2. Implement scanner utilities that discover existing project configuration: skills, commands/slash-commands, MCP server configurations, and CLI tools.
3. Implement a ROLE.md proposer that generates valid, parseable draft ROLE.md files from discovered configuration.
4. Ensure proposed ROLE.md files use minimal (least-privilege) permissions.
5. Make the skill installable via standard skill installation.

## Approach

- Create `skills/mason/SKILL.md` with a system prompt that guides the AI through project analysis.
- Implement `packages/shared/src/mason/scanner.ts` — scanner utilities that programmatically discover:
  - Skills in `.claude/skills/`, `.codex/skills/`, `.aider/skills/`
  - Commands in `.claude/commands/`
  - MCP server configurations from agent settings files (`.claude/settings.json`, `.claude/settings.local.json`)
  - CLAUDE.md / AGENTS.md for existing system prompts
- Implement `packages/shared/src/mason/proposer.ts` — generates a draft ROLE.md from scanner results:
  - Populates frontmatter with discovered configuration
  - Maps MCP server configs to `mcp_servers` entries with minimal `tools.allow` lists
  - Infers container requirements from tool dependencies
  - Uses existing system prompt content for the markdown body
- Validate that proposed ROLE.md files parse correctly through the Change 2 parser (`readMaterializedRole`).

## Risks

- Scanner may not discover all configuration sources in non-standard project layouts.
- Proposed permissions may be too restrictive if usage patterns are incomplete (mitigated by generating a "draft" that users review and edit).

## Out of Scope

- Monorepo generation from proposed roles (Change 10).
- Full CLI command integration (`mason init-repo`) — the skill is AI-driven, not a CLI command.
- Auto-detection of CLI tool argument patterns (would require runtime analysis).
