## Why

Role authoring currently requires knowledge of multiple agent-specific directories (`.claude/roles`, `.codex/roles`, etc.), and the packaging workflow (`mason init-repo`) generates an entire monorepo instead of simply packaging what the author already has. This creates unnecessary friction and misaligns the mental model: a role author should write one `ROLE.md`, then package it — not scaffold a monorepo.

## What Changes

- **ROLE.md location is now always `.mason/roles/{role-name}/ROLE.md`** — a single canonical location, independent of agent dialect
- **Role search narrowed to `.mason/roles/` then `node_modules`** — removes dialect-specific directory scanning for local roles
- **New `mason package --role {role}` command** — builds a distributable npm package from a local role definition, copying referenced tasks/skills/apps into a `build/` directory, then running `npm pack`
- **`sources` property added to ROLE.md** — controls which directories are scanned for tasks/skills/apps when running locally AND which files get copied into the build
- **`.mason/.gitignore` updated** to exclude `roles/**/build` and `roles/**/dist`
- **BREAKING**: `mason add` removed — users run `npm install` directly
- **BREAKING**: `mason pack` removed — replaced by `mason package --role {role}`
- **BREAKING**: `mason mason init-repo` removed — replaced by `mason package --role {role}`

## Capabilities

### New Capabilities
- `mason-package-command`: `mason package --role {role}` command that validates, assembles, and packs a role from `.mason/roles/{role-name}/ROLE.md` into a distributable npm `.tgz`

### Modified Capabilities
- `unified-role-discovery`: Local role search now only looks in `.mason/roles/` (not dialect-specific dirs like `.claude/roles`); packaged role search via `node_modules` is unchanged
- `role-types-core-type-system`: Add `sources` property to ROLE.md frontmatter schema — an array of directory paths (relative to project root) scanned for tasks/skills/apps at runtime and packaged at build time

## Impact

- `packages/shared/src/role/discovery.ts` — narrow local discovery to `.mason/roles/`
- `packages/shared/src/schemas/role-types.ts` — add `sources` field to role schema
- `packages/cli/src/cli/commands/` — add `package.ts`, remove `add.ts`, `pack.ts`, `mason-init-repo.ts`
- `packages/cli/src/cli/index.ts` / `commands/index.ts` — wire up new command, remove old ones
- `.mason/.gitignore` — add build/dist exclusions
- E2E tests referencing removed commands will need to be updated or removed
