## Why

The `forge init` command currently scaffolds an empty workspace with no components. New users have no way to bootstrap a working agent project that demonstrates the forge pattern end-to-end. The forge-core package (Change 1) provides reusable building blocks, and discovery (Change 2) can now find them in node_modules, but there is no `forge init --template` flow to wire it all together.

Creating a template system lets users run `forge init --template note-taker` and immediately get a working agent project with local agent/role definitions that reference forge-core's reusable apps, tasks, and skills. This is the key user-facing feature that ties the packaging story together.

## What Changes

- Create `templates/note-taker/` directory with template files: root `package.json` (depends on `@clawmasons/forge-core`), local agent definition, and local role definition
- Enhance `src/cli/commands/init.ts` with `--template <name>` option to copy template files and apply `{{projectName}}` placeholder substitution
- When `--template` is specified, copy template files first, then apply forge scaffold (`.forge/`, config, .env.example, .gitignore)
- When `--template` is not specified, list available templates for the user to choose from
- After scaffolding with a template, run `npm install` to install dependencies
- Add `"templates"` to the root `package.json` `files` array so templates are bundled in the forge package
- Update tests for the enhanced init command

## Capabilities

### Modified Capabilities
- `workspace-init`: Enhanced with `--template <name>` option, template file copying, `{{projectName}}` placeholder substitution, `npm install` execution, and template listing

### New Capabilities
_(none -- this enhances the existing workspace-init capability)_

## Impact

- **`src/cli/commands/init.ts`**: Major enhancement -- new `--template` option, template copying, placeholder substitution, npm install, template listing
- **`templates/note-taker/`**: New directory with 3 package.json files (root + agent + role)
- **Root `package.json`**: `files` array gains `"templates"` entry
- **`tests/cli/init.test.ts`**: New test cases for template functionality
- **Existing init behavior**: Preserved -- `forge init` without `--template` still works but now also shows template list
