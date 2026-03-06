## Why

The npm scope `@clawforge` is taken. We need to rename all package references from `@clawforge/*` to `@clawmasons/*` to publish under an available npm scope. This affects package names, documentation, specs, and all codebase references.

## What Changes

- **BREAKING**: Rename npm scope from `@clawforge` to `@clawmasons` across all package.json files
- Update all source code references (imports, string literals, comments) from `clawforge` to `clawmasons`
- Update all OpenSpec specs, PRDs, archived changes, and documentation
- Update README, templates, and test fixtures
- Update CLI output strings and error messages referencing `clawforge`

## Capabilities

### New Capabilities
<!-- None — this is a rename, not new functionality -->

### Modified Capabilities
- `package-schema-validation`: Package name references change from `@clawforge/*` to `@clawmasons/*`
- `cli-framework`: CLI binary name and output references updated
- `workspace-init`: Template scaffolding uses new scope name
- `forge-install-command`: Install resolves packages under `@clawmasons` scope
- `package-discovery`: Discovery looks for `@clawmasons` scoped packages
- `docker-install-pipeline`: Docker build references updated scope

## Impact

- **All package.json files**: Root, forge-core/*, templates/*
- **Source code**: `src/` — any hardcoded `clawforge` strings
- **Tests**: `tests/` — fixture data and assertions referencing old scope
- **OpenSpec**: All specs, PRDs, archived changes, proposals, designs
- **Documentation**: README.md
- **npm publishing**: Must use `@clawmasons` scope going forward
