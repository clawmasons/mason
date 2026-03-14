## Context

The CLI binary was recently renamed from `chapter` to `clawmasons`. Now we're doing a second rename to `mason` for brevity. The npm package moves from `@clawmasons/chapter` to `@clawmasons/mason`, with `clawmasons` and `clawmason` as publish aliases. The workspace config directory moves from `.clawmasons/` to `.mason/`. The `@clawmasons/mcp-agent` package name stays unchanged.

The codebase has ~455 occurrences of "clawmasons" across ~30 files (source, tests, specs, docs, config). Most are in docs/PRDs/specs rather than runtime code.

## Goals / Non-Goals

**Goals:**
- Rename CLI binary from `clawmasons` to `mason`
- Rename npm package from `@clawmasons/chapter` to `@clawmasons/mason`
- Add publish aliases: `clawmasons`, `clawmason`
- Rename config directory from `.clawmasons/` to `.mason/`
- Update all source code identifiers: `CLAWMASONS_*` → `MASON_*`, variable names with `clawmasons` → `mason`
- Update all specs, docs, and PRDs to reflect the new naming
- Update all test assertions

**Non-Goals:**
- Renaming the `@clawmasons` npm scope — the org name stays
- Renaming `@clawmasons/mcp-agent` — stays as-is
- Renaming the GitHub repo or project directory
- Backward-compatibility shims for the old `clawmasons` binary
- Renaming internal domain concepts (e.g., `chapter.json` config file name)

## Decisions

### 1. Mechanical rename strategy

**Decision**: Targeted file-by-file renaming, not a global find-and-replace.

**Rationale**: A blind find-and-replace of "clawmasons" would hit the `@clawmasons/` npm scope which must NOT change. Each file needs contextual judgment:
- `.clawmasons/` directory paths → `.mason/`
- `clawmasons` binary references → `mason`
- `@clawmasons/chapter` package → `@clawmasons/mason`
- `CLAWMASONS_BIN` constants → `MASON_BIN`
- `Clawmasons` in descriptions → `Mason`
- `@clawmasons/` scope prefix → unchanged

### 2. Config directory: `.mason/`

**Decision**: Use `.mason/` as the new config directory name.

**Rationale**: Matches the binary name. Subdirectories stay the same (`.mason/docker/`, `.mason/sessions/`, `.mason/empty-file`).

### 3. npm package publishing

**Decision**: Primary package is `@clawmasons/mason`. Additionally published as `clawmasons` and `clawmason` (unscoped aliases).

**Rationale**: Users can `npx mason`, `npx clawmasons`, or `npx clawmason` to invoke the CLI. The scoped name keeps organizational consistency.

### 4. Environment variables

**Decision**: Keep existing `CHAPTER_*` env var names unchanged for now.

**Rationale**: Environment variables like `CHAPTER_PROXY_TOKEN`, `CHAPTER_PROXY_PORT`, `CHAPTER_SESSION_TYPE`, `CHAPTER_ACP_CLIENT` are internal/generated and not user-facing brand touchpoints. Renaming them adds risk with no user benefit. This can be a follow-up change if desired.

### 5. Spec files update scope

**Decision**: Update all spec files in `openspec/specs/` that reference `clawmasons` or `.clawmasons`. Create delta specs only for specs with behavioral requirement changes. Specs with only cosmetic text changes (binary name in scenarios) get updated directly.

**Rationale**: Delta specs are for requirement-level changes. The rename changes the binary name and config directory in requirements, which are behavioral changes that affect testable scenarios.

## Risks / Trade-offs

- **[Risk] Users with existing `.clawmasons/` directories** → No automatic migration. Document in changelog that users must rename `.clawmasons/` to `.mason/`. Consider adding a one-time migration check in a follow-up.
- **[Risk] Publish alias conflicts** → Verify `clawmasons` and `clawmason` package names are available on npm before publishing.
- **[Risk] Scope of changes is large** → ~30 files across source, tests, specs, docs. Mitigated by doing it as a single atomic commit and running full test suite.
- **[Trade-off] No backward compat for old binary name** → Clean break. Users upgrading must update scripts. This is acceptable for a pre-1.0 project.
