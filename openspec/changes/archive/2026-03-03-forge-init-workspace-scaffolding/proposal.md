## Why

forge has validated schemas for all five package types but no CLI entry point or commands. Developers cannot interact with forge yet. The `forge init` command is the foundational user touchpoint — it creates the monorepo workspace structure that all subsequent commands (add, build, install, run) operate within. Without it, there's no way to start building agent components.

## What Changes

- Add Commander.js as a runtime dependency for CLI argument parsing
- Create `bin/forge.js` CLI entry point registered in package.json `bin` field
- Implement `forge init` command that scaffolds the full workspace structure:
  - Root `package.json` with npm workspaces config (`apps/*`, `tasks/*`, `skills/*`, `roles/*`, `agents/*`)
  - `.forge/config.json` with workspace-level forge configuration defaults
  - `.forge/.env.example` template for credential bindings
  - Type-organized directories: `apps/`, `tasks/`, `skills/`, `roles/`, `agents/`
- Add `.gitignore` to scaffolded workspace (node_modules, .env, dist)
- Handle idempotency: warn if workspace already exists (detected by `.forge/` directory presence)
- Support `--name` flag to set the workspace/package name (defaults to directory name)

## Capabilities

### New Capabilities
- `cli-framework`: Commander.js CLI entry point with command routing, help text, and version display
- `workspace-init`: The `forge init` command that scaffolds a monorepo workspace with all required directories, config files, and npm workspace configuration

### Modified Capabilities

## Impact

- **New dependency:** `commander` (runtime)
- **package.json:** Adds `bin` field pointing to `bin/forge.js`, adds commander dependency
- **New source files:** `src/cli/index.ts` (CLI entry), `src/cli/commands/init.ts` (init command logic), `src/cli/commands/index.ts` (command registry)
- **New test files:** Tests for init command covering scaffolding, idempotency, and edge cases
- **Build output:** `dist/cli/` directory with compiled CLI code, `bin/forge.js` shebang wrapper
