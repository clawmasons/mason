## Why

The `example/` directory contains useful forge components (filesystem app, note-taking task, markdown skill, writer role, note-taker agent) that are trapped with `@example/*` naming. They cannot be installed as dependencies by real users. Creating `@clawforge/forge-core` as a publishable workspace package makes these components reusable building blocks that any forge project can depend on, which is the prerequisite for the template system (Change 3) and discovery enhancement (Change 2).

## What Changes

- Create `forge-core/` directory at repo root as an npm workspace member
- Create `forge-core/package.json` for `@clawforge/forge-core` with all component directories in `files` array
- Copy component definitions from `example/` into `forge-core/`: `apps/filesystem/`, `tasks/take-notes/`, `skills/markdown-conventions/`, `roles/writer/`, `agents/note-taker/`
- Rename all package names from `@example/*` to `@clawforge/*` (e.g., `@example/app-filesystem` → `@clawforge/app-filesystem`)
- Update all forge-field cross-references to use `@clawforge/*` names
- Add `"workspaces": ["forge-core"]` to root `package.json`
- `example/` directory is NOT removed (deferred to Change 5)

## Capabilities

### New Capabilities
- `forge-core-package`: Defines the structure, naming, and content of the `@clawforge/forge-core` component library package — the standard set of reusable apps, tasks, skills, roles, and agents that ship with forge.

### Modified Capabilities
_(none — discovery and init changes are separate PRD changes)_

## Impact

- **Root `package.json`**: Gains `"workspaces": ["forge-core"]` field, making the repo an npm workspace monorepo
- **New directory**: `forge-core/` with 6 package.json files (1 root + 5 components)
- **npm install**: Will now install workspace dependencies for forge-core
- **`npm pack` in forge-core/**: Must produce a valid `.tgz` containing all component directories
- **Existing tests**: No changes needed — `example/` is preserved and tests still reference it
