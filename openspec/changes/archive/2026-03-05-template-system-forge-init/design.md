## Context

Forge's `forge init` command scaffolds empty workspaces with directory structure and config files but no components. The forge-core package (Change 1) provides reusable `@clawforge/*` components, and the enhanced discovery (Change 2) can find them in `node_modules`. This change adds the template system that ties it together: `forge init --template note-taker` copies local agent/role definitions and a `package.json` that depends on `@clawforge/forge-core`, giving users a working project immediately.

The existing `init.ts` uses `commander` for CLI parsing, creates directories via `fs.mkdirSync`, and writes files synchronously. It already supports `--name` for the project name.

## Goals / Non-Goals

**Goals:**
- Create `templates/note-taker/` with package.json, local agent, and local role
- Add `--template <name>` option to `forge init`
- Copy template files with `{{projectName}}` placeholder substitution
- List available templates when `--template` is not specified
- Run `npm install` after template scaffolding
- Bundle templates in the forge package (`files` array)

**Non-Goals:**
- Remote template fetching (REQ-011, P2)
- Multiple templates beyond note-taker (PRD non-goal for v1)
- Package manager detection (REQ-010, P1 -- nice-to-have, not required)
- Removing `example/` directory (Change 5)
- Modifying the Dockerfile (Change 4)

## Decisions

### 1. Templates are file trees, not npm packages
Templates are plain directories under `templates/` in the forge package. They are not npm packages themselves -- they have no `node_modules`, no build step. `forge init` simply copies their contents to the target directory. This keeps things simple and avoids circular dependencies.

### 2. Placeholder substitution uses `{{projectName}}`
Template `package.json` files use `{{projectName}}` as a placeholder for the project scope. During `forge init`, this is replaced with the project name derived from `--name` or the directory basename. Only `package.json` files undergo substitution to keep the system simple and predictable. The project name is extracted as just the scope portion (e.g., `@acme/my-agent` yields `acme`, `test-forge` yields `test-forge`).

### 3. Template package.json uses version ranges, not tgz paths
The template's `package.json` references `@clawforge/forge-core` with a standard version range (`^0.1.0`), not a hardcoded tgz path. For local testing, users install the tgz manually before or after `forge init`. This keeps templates registry-agnostic.

### 4. `forge init` without `--template` lists templates
When no `--template` is provided, `forge init` reads the `templates/` directory and prints available template names, then proceeds with the plain scaffold (no template files). This provides discoverability without requiring interactive selection (which would need a TUI dependency).

### 5. `npm install` runs automatically after template scaffolding
After copying template files and creating the forge scaffold, `forge init` automatically runs `npm install` in the target directory. This ensures `@clawforge/forge-core` is installed and discoverable immediately. The install step is only triggered when a template is used (not for bare scaffold).

### 6. Template agent/role use `{{projectName}}` scope, not `@clawforge`
The local agent and role in the template use `@{{projectName}}/agent-note-taker` and `@{{projectName}}/role-writer` naming. This creates project-scoped local overrides that shadow the generic `@clawforge/*` versions in forge-core, letting users customize their project's components independently.

## Risks / Trade-offs

- **[Risk] `npm install` fails during init** -- If the user doesn't have network access or forge-core isn't available, `npm install` fails. Mitigated by: (1) template works with local tgz installs if user pre-installs, (2) forge init prints a clear error message.
- **[Risk] Template directory not found when installed via npm** -- `forge init` needs to find `templates/` relative to the forge package, not the user's cwd. Mitigated by resolving templates relative to `__dirname` (or `import.meta.url`) at runtime.
- **[Trade-off] No interactive selection** -- We list templates but don't provide arrow-key selection. This avoids adding a TUI dependency (e.g., inquirer/prompts) but is less user-friendly. Acceptable for v1 with a single template.
