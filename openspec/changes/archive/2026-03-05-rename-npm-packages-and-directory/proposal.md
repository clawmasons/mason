## Why

The `chapter-members` PRD (REQ-004, REQ-001) requires renaming all npm packages and the `forge-core/` directory to use "chapter" branding. Change #1 renamed the metadata field; this change renames the actual package identities, the workspace directory, the CLI binary entry point, and the agent package prefix (`agent-*` -> `member-*`).

## What Changes

- **BREAKING**: Rename root package `@clawmasons/forge` -> `@clawmasons/chapter`
- **BREAKING**: Rename `forge-core/` directory -> `chapter-core/` and its package `@clawmasons/forge-core` -> `@clawmasons/chapter-core`
- **BREAKING**: Rename CLI entry point `bin/forge.js` -> `bin/chapter.js` and update `"bin"` field in root package.json from `"forge"` to `"chapter"`
- Rename agent package `@clawmasons/agent-note-taker` -> `@clawmasons/member-note-taker` in `chapter-core/`
- Update root `package.json`: name, description, bin, workspaces field
- Update `chapter-core/package.json`: name, description, files array (`"agents"` -> `"members"`)
- Rename directory `forge-core/agents/` -> `chapter-core/members/` (note-taker stays in place)
- Update template `package.json` files: dependency `@clawmasons/forge-core` -> `@clawmasons/chapter-core`, workspaces `"agents/*"` -> `"members/*"`, agent package name prefix -> member
- Update `src/generator/proxy-dockerfile.ts`: ENTRYPOINT path `bin/forge.js` -> `bin/chapter.js`, `/app/forge/` -> `/app/chapter/`
- Update all test files referencing old package names, directory paths, or bin path
- Regenerate `package-lock.json`

## Capabilities

### Modified Capabilities
- `forge-core-package` (to be renamed `chapter-core-package`): Directory and package renamed, files array updated
- `docker-install-pipeline`: Proxy Dockerfile ENTRYPOINT references updated
- `forge-install-command`: Comments referencing forge-core paths updated
- `workspace-init`: Template references updated to chapter-core

## Impact

- **Root config**: `package.json`, `package-lock.json` -- name, bin, workspaces
- **Directory rename**: `forge-core/` -> `chapter-core/` (entire directory)
- **File rename**: `bin/forge.js` -> `bin/chapter.js`
- **Sub-directory rename**: `chapter-core/agents/` -> `chapter-core/members/`
- **Generator**: `src/generator/proxy-dockerfile.ts` -- ENTRYPOINT path
- **CLI install**: `src/cli/commands/install.ts` -- comment referencing forge-core
- **Templates**: `templates/note-taker/package.json`, `templates/note-taker/agents/` -> `templates/note-taker/members/`
- **Tests**: `tests/resolver/discover.test.ts`, `tests/integration/install-flow.test.ts`, `tests/generator/proxy-dockerfile.test.ts`, `tests/cli/install.test.ts`, `tests/cli/init.test.ts`, and others referencing old names
