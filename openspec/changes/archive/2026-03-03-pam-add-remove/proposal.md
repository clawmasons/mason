## Why

The pam CLI currently has no way to add or remove package dependencies. Users must manually run npm commands and hope the package has a valid `pam` field. `pam add` and `pam remove` wrap npm's install/uninstall with pam-specific validation (valid `pam` field, compatible type) and safety checks (dependent package warnings), keeping the workspace dependency graph consistent.

## What Changes

- **New `pam add <pkg>` command**: Wraps `npm install`. After installation, reads the installed package's `package.json`, validates it has a valid `pam` field using the existing Zod schemas, and rejects (uninstalls) if validation fails.
- **New `pam remove <pkg>` command**: Wraps `npm uninstall`. Before removal, scans the workspace for packages that depend on the target package via `pam` field references (e.g., a role referencing an app in its `permissions`, a task referencing an app/skill in `requires`). If dependents exist, warns and requires `--force` to proceed.
- Both commands integrate into the existing Commander.js CLI registration pattern and follow established error handling conventions.

## Capabilities

### New Capabilities
- `add-command`: The `pam add <pkg>` command — npm install delegation with pam field validation and type checking
- `remove-command`: The `pam remove <pkg>` command — npm uninstall delegation with dependent package safety checking

### Modified Capabilities

## Impact

- **CLI**: Two new commands registered in `src/cli/commands/index.ts`
- **New files**: `src/cli/commands/add.ts`, `src/cli/commands/remove.ts`
- **New tests**: `tests/cli/add.test.ts`, `tests/cli/remove.test.ts`
- **Dependencies**: Uses existing `discoverPackages()`, `parsePamField()`, and schema validators — no new dependencies needed
- **npm operations**: First commands to shell out to npm via `child_process` (new pattern for this codebase)
