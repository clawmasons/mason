# Proposal: Documentation Updates

## Problem

The project's user-facing and developer-facing documentation still references the deprecated `agent` package type and `clawmasons agent` command syntax. The README.md describes agents as "deployable units," the quick start uses `clawmasons agent note-taker writer`, and the DEVELOPMENT.md references `resolveAgent` and `ResolvedAgent` in its programmatic API examples. The e2e/README.md shows deprecated commands like `chapter run-agent` and `chapter run-acp-agent`. This creates confusion for new users and contributors who encounter outdated terminology that no longer matches the codebase.

## Proposed Solution

Update all three documentation files to reflect the role-centric architecture:

1. **README.md** -- Update project overview to describe roles as the primary unit. Replace quick start example with `clawmasons run claude --role <name>`. Update the "How It Works" table to remove the `Agent` package type. Update the ACP example to use `clawmasons run claude --role writer --acp`. Add documentation for ROLE.md format and local-first workflow.

2. **e2e/README.md** -- Replace `chapter run-agent` with `clawmasons run claude --role <name>`. Replace `chapter run-acp-agent` with `clawmasons run claude --role <name> --acp`. Update test suite descriptions to cover role-based test scenarios. Update artifact inspection examples.

3. **DEVELOPMENT.md** -- Update programmatic API examples to use role-centric imports (`discoverRoles`, `resolveRole`, `RoleType`). Update architecture description to mention ROLE_TYPES pipeline and dialect registry. Remove references to `agent` package type.

## Scope

- Modify: `README.md`
- Modify: `e2e/README.md`
- Modify: `DEVELOPMENT.md`
- No code changes required
- Verify: no references to deprecated `agent` command or package type remain in these files

## Risks

- Low risk -- documentation-only change, no code modifications
- Must ensure command examples match the actual CLI interface
