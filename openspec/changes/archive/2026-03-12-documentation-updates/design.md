# Design: Documentation Updates

## Overview

This is a documentation-only change. No code is modified. Three markdown files are updated to replace deprecated `agent` terminology and commands with the role-centric equivalents established by Changes 1-12.

## Changes by File

### README.md

1. **Project tagline**: Keep as-is (already mentions "AI agents" generically, which is fine).
2. **Why Clawmasons bullet points**: Update "Role-based tool filtering" wording if needed. The current wording is already accurate.
3. **Quick Start**: Replace `clawmasons agent note-taker writer` with `clawmasons run claude --role note-taker`. Update surrounding context to describe creating a ROLE.md instead of "building the agent."
4. **How It Works table**: Remove the `Agent` row. The four remaining types are: App, Skill, Task, Role. Update the description for Role from "Permission boundary" to "Deployable unit — tasks, tools, permissions, and system prompt." Add a paragraph about ROLE.md as the source of truth.
5. **Editor Integration (ACP)**: Replace `clawmasons agent --acp --role writer` with `clawmasons run claude --role writer --acp`. Update the doc link.
6. **Documentation table**: Keep as-is (links to docs/ which are out of scope for this change).

### e2e/README.md

1. **Running agents manually section**: Replace `chapter run-agent test-note-taker writer` with `clawmasons run claude --role test-writer`. Replace `chapter run-acp-agent` examples with `clawmasons run claude --role mcp-test --acp`.
2. **Test suite descriptions**: Add descriptions for the new role-based test files (role-workflow, cross-agent-materialization, volume-masking, error-paths).
3. **Artifact inspection examples**: Update `chapter list` description to mention roles instead of agents.

### DEVELOPMENT.md

1. **Programmatic API section**: Replace `resolveAgent`, `validateAgent`, `ResolvedAgent` with role-centric equivalents: `discoverRoles`, `resolveRole`, `RoleType`, `readMaterializedRole`.
2. **Project Structure**: No changes needed (package names are stable).
3. **Architecture note**: Add a brief mention of the ROLE_TYPES pipeline and dialect registry.

## Verification

After changes:
- `npx tsc --noEmit` still passes (no code changes)
- `npx vitest run` still passes (no code changes)
- Grep for `clawmasons agent` in the three files returns zero matches
- Grep for `chapter.type.*agent` or `type.*"agent"` in the three files returns zero matches
