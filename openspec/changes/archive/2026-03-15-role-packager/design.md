## Context

Local role discovery currently scans all dialect-specific agent directories (`.claude/roles`, `.codex/roles`, etc.), coupling role authoring to the agent being used. The `mason init-repo` command addresses packaging but generates an entire npm monorepo, which is far more complex than what role authors need. The result is that the packaging workflow is rarely used and poorly understood.

This design introduces a canonical, agent-agnostic home for local roles (`.mason/roles/`) and a simple `mason package --role {role}` command that assembles and packs a single role into a distributable npm package — no monorepo required.

## Goals / Non-Goals

**Goals:**
- Single canonical location for local roles: `.mason/roles/{role-name}/ROLE.md`
- Local role search reads only `.mason/roles/`, then `node_modules`
- `mason package --role {role}` assembles a build directory and calls `npm pack`
- `sources` ROLE.md property controls which directories supply tasks/skills/apps (at runtime and at pack time)
- Build outputs (`.mason/roles/**/build`, `.mason/roles/**/dist`) are gitignored
- Remove `mason add`, `mason pack`, `mason mason init-repo`

**Non-Goals:**
- Multi-role packaging (one command packs one role)
- Monorepo generation (replaced entirely)
- Publishing to npm (users run `npm publish` after packing)
- Migrating existing `.claude/roles/` definitions automatically

## Decisions

### 1. Canonical role location: `.mason/roles/` only

**Decision**: Local role discovery scans only `.mason/roles/{role-name}/ROLE.md`. Dialect-specific directories (`.claude/roles`, etc.) are no longer searched.

**Rationale**: Roles are agent-agnostic definitions. Coupling their location to an agent directory (`.claude`) was a historical accident. `.mason/` is the correct owner of mason-level configuration.

**Alternative considered**: Keep dialect-specific paths as fallback. Rejected — split discovery logic creates confusion about where a role "lives" and complicates the package command's file resolution.

**Migration**: Users with roles in `.claude/roles/` must move them to `.mason/roles/`. This is a breaking change documented in the What Changes section of the proposal.

---

### 2. `sources` property in ROLE.md controls file resolution

**Decision**: Add a `sources` field to the ROLE.md frontmatter schema — an array of directory paths (relative to project root) that are scanned for tasks, skills, and apps at runtime. The same list controls which files are copied into the build directory during packaging.

```yaml
sources:
  - .claude/
  - .codex/
```

the search should use terms and files specific to the type of directory it is searching.  For example ".claude/commands" when searching for tasks

another example is being to able to pull out mcp server configuration for an app


**Rationale**: Different projects organize tasks/skills in different locations. A declarative `sources` list makes this explicit and portable, and gives the `package` command a clear contract for what to include.

**Alternative considered**: Auto-detect by scanning common directories. Rejected — implicit scanning is fragile and produces non-reproducible packages.

**Runtime behavior**: When a role is loaded from `.mason/roles/` (local), the runtime resolves task/skill/app refs by searching the `sources` directories. When a role is loaded from a package (node_modules), only the files inside the package are used — `sources` is ignored at runtime for packaged roles.

---

### 3. Build directory structure (flat, co-located)

**Decision**: `mason package` creates `.mason/roles/{role-name}/build/` containing a self-contained npm package:

```
.mason/roles/{role-name}/build/
  package.json        # generated, with chapter.type: "role"
  ROLE.md             # copied from source
  tasks/              # task files copied from sources
  skills/             # skill files copied from sources
  apps/               # app files copied from sources (if applicable)
```

**Rationale**: Co-locating build output with the role definition makes the relationship clear. A flat package (not a monorepo) is the right granularity — tasks/skills/apps are included as files, not separate npm packages. This is simpler and matches what users actually need for distribution.

**Alternative considered**: Separate output directory (like `dist/` at project root). Rejected — co-location makes it obvious where to look and `.gitignore` patterns are simpler.

---

### 4. Package command fails on missing references

**Decision**: `mason package --role {role}` exits with a non-zero code and descriptive error if any task, skill, or app referenced in ROLE.md cannot be found in the `sources` directories.

**Rationale**: A package with broken references is useless. Fail loudly at build time rather than silently at runtime.

**Implementation**: Resolve all refs before copying anything. Collect all errors and report them together (don't stop on the first one).

---

### 5. `npm pack` called in build directory

**Decision**: After assembling the build directory, the command runs in sequence:

```bash
npm install          # install devDependencies if package.json lists any
npm run build        # if "build" script exists in generated package.json
npm pack             # create .tgz in build/
```

**Rationale**: Standard npm tooling, no custom packaging logic. The `.tgz` output is a standard npm package installable via `npm install ./path/to/file.tgz` or published via `npm publish`.

---

### 6. Remove `mason add`, `mason pack`, `mason mason init-repo`

**Decision**: These three commands are deleted. Users use `npm install` and `npm pack` directly, and `mason package` replaces `init-repo`.

**Rationale**: `mason add` duplicated `npm install` with a validation step that can be triggered in other ways. `mason pack` was workspace-scoped (packing all packages), not role-scoped. `mason init-repo` generated a monorepo — the new command is simpler and more direct.

## Risks / Trade-offs

**Breaking change: role location** → Mitigation: Clear error message when a role is not found pointing users to `.mason/roles/`. Document migration in changelog.

**`sources` requires explicit configuration** → Mitigation: If `sources` is absent, the command defaults to scanning common directories (`.claude/skills`, `.claude/tasks`) with a warning — but packaging without `sources` is disallowed (must be explicit to produce a reproducible package).

**Packaged roles lose runtime `sources` resolution** → This is intentional: packaged roles are self-contained. If a consumer needs to extend a packaged role, they eject it to `.mason/roles/` and add their own `sources`.

**`npm pack` / `npm install` must be available** → Assumed — mason already requires npm.

## Migration Plan

1. Role authors move ROLE.md from `.{agent}/roles/{name}/ROLE.md` to `.mason/roles/{name}/ROLE.md`
2. Add `sources` to ROLE.md listing directories where tasks/skills are defined
3. Run `mason package --role {name}` instead of `mason init-repo --role {name}`
4. Remove any CI steps using `mason add` / `mason pack` / `mason mason init-repo`

No data migration is required — ROLE.md content is unchanged; only the file location changes.

## Open Questions

- Should the generated `package.json` in the build directory be derived from a `package.json` in `.mason/roles/{name}/` (if present) or always generated fresh? A user-supplied `package.json` would allow custom devDependencies and build scripts. 
  - **Accepted proposal Proposal**: If `.mason/roles/{name}/package.json` exists, merge it with generated fields ()`files`); otherwise generate from scratch.
