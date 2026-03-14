## Why

The CLI binary is currently named `clawmasons` which is long and cumbersome to type. Renaming to `mason` provides a shorter, cleaner developer experience while aligning the npm package name (`@clawmasons/mason`) and supporting additional publish aliases (`clawmasons`, `clawmason`). The config directory also moves from `.clawmasons` to `.mason` for consistency.

## What Changes

- **BREAKING**: CLI binary renamed from `clawmasons` to `mason` — all user-facing commands change (e.g., `mason build`, `mason run-agent`)
- **BREAKING**: Config directory renamed from `.clawmasons/` to `.mason/` — existing projects need to rename their config directories
- **BREAKING**: npm package renamed to `@clawmasons/mason`, with `clawmasons` and `clawmason` as additional publish aliases
- All source code references updated: `Clawmasons` → `Mason`, `CLAWMASONS` → `MASON` (variable names, constants, log prefixes)
- All spec.md files in `openspec/specs/` updated to reflect new naming
- Documentation updated (README, docs/, DEVELOPMENT.md, PRDs)
- Generated Dockerfiles, help text, error messages, and log output all reference `mason`
- Proxy dependencies idempotency check and error messages update `@clawmasons/chapter` → `@clawmasons/mason`
- `@clawmasons/mcp-agent` package name stays unchanged
- E2E and unit test assertions updated to match new binary name and config paths

## Capabilities

### New Capabilities

_(none — this is a rename of existing capabilities)_

### Modified Capabilities

- `cli-binary-rename`: Binary entry point, Commander program name, and all CLI references change from `clawmasons` to `mason`
- `cli-framework`: Program name and bin registration change to `mason`
- `workspace-init`: Config directory changes from `.clawmasons/` to `.mason/`; any init logic that creates or references `.clawmasons` must update
- `docker-generation-container-ignore`: If `.clawmasons` is referenced in ignore patterns, update to `.mason`
- `env-generation`: If `.clawmasons` paths are used in env file generation, update to `.mason`
- `e2e`: Test helpers and assertions update from `CLAWMASONS_BIN` to `MASON_BIN`, config paths from `.clawmasons` to `.mason`
- `credential-loading`: If credential paths reference `.clawmasons`, update to `.mason`
- `credential-resolver`: If resolver paths reference `.clawmasons`, update to `.mason`
- `docker-install-pipeline`: Proxy dependencies check references `@clawmasons/chapter` package — update to `@clawmasons/mason`

## Impact

- **CLI package** (`packages/cli/`): `package.json` bin field, program name, all command files, all test files
- **Shared package** (`packages/shared/`): Any constants or paths referencing `clawmasons` or `.clawmasons`
- **npm publishing**: Package name changes to `@clawmasons/mason`; additional entries needed for `clawmasons` and `clawmason` aliases
- **Config directory**: `.clawmasons/` → `.mason/` across all code that reads/writes workspace config
- **Specs**: ~30+ spec files in `openspec/specs/` reference `clawmasons` in scenarios and requirements
- **Docs**: README.md, docs/*.md, DEVELOPMENT.md, PRD files
- **Root config**: `package.json` description, `.gitignore`, `vitest.config.ts`
- **Skills**: `skills/mason/` templates referencing `.clawmasons`
- **Users**: Existing users must rename `.clawmasons/` → `.mason/` in their projects and update any scripts referencing the `clawmasons` binary

