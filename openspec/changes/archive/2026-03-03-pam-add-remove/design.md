## Context

The pam CLI has eight commands implemented (init, build, install, validate, list, permissions, run, stop) but lacks `add` and `remove` — the two commands that manage individual package dependencies. Currently, packages must be manually placed in workspace directories or installed via raw `npm install`. There is no npm delegation or pam-field validation on install, and no dependent-checking on removal.

All existing commands follow the Commander.js registration pattern: a `register<X>Command(program)` function in `src/cli/commands/<x>.ts`, registered in `src/cli/commands/index.ts`. Commands call `discoverPackages()` for workspace scanning and use `parsePamField()` from `src/schemas/` for validation. Error handling uses try/catch with `console.error` + `process.exit(1)`.

No existing command shells out to npm. The `add` and `remove` commands will be the first to do so.

## Goals / Non-Goals

**Goals:**
- `pam add <pkg>` delegates to `npm install`, then validates the installed package has a valid `pam` field
- `pam remove <pkg>` checks for pam-level dependents before delegating to `npm uninstall`
- Both commands follow existing CLI patterns (Commander.js registration, error handling, console output)
- Both commands are tested with the established vitest pattern (temp dirs, spies, fixture packages)

**Non-Goals:**
- No registry-level validation (checking npm registry metadata before install) — we validate post-install
- No interactive prompts or TUI — both commands are non-interactive
- No workspace-aware npm operations (e.g., `npm -w apps/github install`) — we use simple `npm install` at the root
- No automatic rebuilding of agent scaffolds after add/remove — users run `pam install` separately

## Decisions

### 1. npm delegation via child_process.execFileSync

Use `child_process.execFileSync("npm", [...args], { cwd: rootDir, stdio: "inherit" })` to run npm commands. `execFileSync` avoids shell injection. `stdio: "inherit"` lets npm output stream directly to the terminal.

**Alternatives considered:**
- `execa` or `cross-spawn`: Unnecessary dependency for simple sync calls.
- Programmatic npm API: npm's programmatic API is undocumented and unstable. CLI delegation is the recommended approach.
- Async `execFile`: Not needed — these are blocking operations where the user expects to wait.

### 2. Post-install validation for `pam add`

After `npm install` succeeds, read the installed package's `package.json` from `node_modules/<pkg>/` and validate its `pam` field with `parsePamField()`. If validation fails, run `npm uninstall` to clean up, then exit with error.

**Alternatives considered:**
- Pre-install registry check (fetch package.json from npm before installing): Adds complexity, requires network fetch logic, and doesn't work for local/file packages.
- Accept any package and validate later: Breaks the "consistent graph" invariant — users would have non-pam packages in their workspace.

### 3. Dependent checking for `pam remove` via discoverPackages + graph scan

Before removal, call `discoverPackages()` to get all workspace packages, then scan their `pam` fields for references to the target package. Check:
- Role `permissions` keys (app references)
- Role `tasks` and `skills` arrays
- Task `requires.apps` and `requires.skills` arrays
- Agent `roles` arrays

If any package references the target, list dependents and exit with error unless `--force` is passed.

### 4. Forward extra flags to npm

Both commands accept variadic args (`[npmArgs...]`) that are forwarded directly to the underlying npm command. This lets users pass `--save-dev`, `--legacy-peer-deps`, etc. without pam needing to know about them.

## Risks / Trade-offs

- **npm install output noise**: `stdio: "inherit"` means npm's full output is shown. This is intentional — users should see what npm is doing. If too noisy, a future `--quiet` flag could capture output.
- **Race between install and validate**: If `npm install` fails partway (e.g., network error), the package may be partially installed. We rely on npm's own cleanup for this case.
- **Dependent check is local only**: `pam remove` only checks the local workspace, not published packages that might depend on the target. This is consistent with npm's behavior — it's the local graph we care about.
- **execFileSync blocks the event loop**: Acceptable for a CLI tool where the user is waiting for the command to complete.
