# Proposal: Monorepo Generation

**Change:** #10 from agent-roles IMPLEMENTATION.md
**Date:** 2026-03-12
**Status:** Proposed

## Problem

Users who develop roles locally (via ROLE.md files) have no automated way to package them for distribution through npm registries. Converting a local role and its dependencies (skills, apps, tasks) into a publishable npm workspace monorepo requires manually creating package.json files for each component, configuring npm workspaces correctly, and ensuring each sub-package is independently publishable. This is tedious and error-prone.

With Changes 1-9 establishing the complete role pipeline (ROLE_TYPES, parser, adapter, discovery, materializer, Docker generation, CLI, Mason skill), users need a tool that bridges the gap between "local role definition" and "distributable npm packages."

## Goal

1. Implement `mason init-repo --role <name> [--target-dir <path>]` CLI command.
2. Create a monorepo generator that reads a local `RoleType` and creates a complete npm workspace structure.
3. Generate correct `package.json` files for each dependency type (role, skill, app, task) with appropriate `chapter.type` fields.
4. Default target directory: `.clawmasons/repositories/<role-name>/`.
5. Generated monorepo supports `npm publish --workspaces` and `npm pack --workspaces`.

## Approach

- Add `mason init-repo` as a subcommand under the `mason` command group (or as a top-level mason command registered via the CLI framework).
- Implement a monorepo generator in `packages/cli/src/commands/mason-init-repo.ts` that:
  1. Resolves the named role via `resolveRole()` from Change 5 (unified role discovery)
  2. Reads the role's ROLE.md and all dependency references
  3. Generates the directory structure per PRD section 11.3
  4. Creates package.json files for the root workspace and each sub-package
  5. Copies ROLE.md and bundled resources into the role package
- Validate the generated structure by checking all package.json files are valid JSON and workspace configuration is correct.

## Risks

- Role dependencies that are NPM package references (not local paths) cannot have their source copied into the monorepo — only a package.json referencing them can be generated.
- The generated monorepo is a one-time snapshot; it does not stay in sync with the source role automatically.

## Out of Scope

- Automatic publishing to npm registries (users run `npm publish --workspaces` themselves).
- Keeping the generated monorepo in sync with local role changes.
- Generating CI/CD pipelines for the monorepo.
