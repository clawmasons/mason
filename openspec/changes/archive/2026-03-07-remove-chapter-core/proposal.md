## Why

The `@clawmasons/chapter-core` package adds unnecessary indirection. It's a separately published npm package containing pre-built components (apps, tasks, skills) that templates depend on at runtime. This means `chapter init` produces projects that require installing chapter-core from npm, and the discovery system needs special logic to scan inside node_modules for chapter-core sub-components. By inlining these components directly into the template, initialized projects become self-contained — all components live in the workspace and use project-scoped package names.

## What Changes

- **BREAKING**: Remove the `@clawmasons/chapter-core` npm package entirely
- Copy `chapter-core/apps/filesystem` → `templates/note-taker/apps/filesystem` with `@{{projectScope}}/app-filesystem` package name
- Copy `chapter-core/skills/markdown-conventions` → `templates/note-taker/skills/markdown-conventions` with `@{{projectScope}}/skill-markdown-conventions` package name
- Copy `chapter-core/tasks/take-notes` → `templates/note-taker/tasks/take-notes` with `@{{projectScope}}/task-take-notes` package name
- Update `templates/note-taker/roles/writer/package.json` permission key from `@clawmasons/app-filesystem` to `@{{projectScope}}/app-filesystem`
- Remove `chapter-core` from root workspace config
- Remove chapter-core discovery logic from the resolver
- Update all tests and e2e fixtures that reference chapter-core

## Capabilities

### New Capabilities
- `inline-template-components`: Template components (apps, tasks, skills) are defined inline within the template directory using `{{projectScope}}` placeholders, making initialized projects fully self-contained

### Modified Capabilities
- `package-discovery`: Remove the special-case logic that scans inside `node_modules/@clawmasons/chapter-core` for sub-components
- `workspace-init`: Template no longer includes `@clawmasons/chapter-core` as a dependency; all components are local workspace packages
- `chapter-core-package`: This capability is being removed entirely

## Impact

- **chapter-core/**: Entire directory deleted
- **templates/note-taker/**: Gains `apps/`, `skills/`, `tasks/` directories with templatized package names
- **src/resolver/discover.ts**: Remove chapter-core scanning logic
- **tests/**: Update `init.test.ts`, `discover.test.ts`, `install-flow.test.ts` to remove chapter-core expectations
- **e2e/fixtures/**: Remove chapter-core dependency from test fixtures
- **root package.json**: Remove `chapter-core` from workspaces array
