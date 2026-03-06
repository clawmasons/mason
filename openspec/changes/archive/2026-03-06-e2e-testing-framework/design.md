## Architecture

The `e2e/` package is a standalone workspace package that sits alongside the main `@clawmasons/chapter` package and `chapter-core/`. Since the root package IS `@clawmasons/chapter`, the e2e package does not list it as an explicit dependency -- npm workspace symlinks make it available automatically. The e2e scripts invoke chapter via its CLI binary (`bin/chapter.js`) using relative path resolution.

### Package Structure

```
e2e/
├── package.json           # Private, type: module, devDeps: vitest + tsx + dotenv
├── tsconfig.json          # TypeScript config (ES2022, Node16, strict)
├── vitest.config.ts       # Test runner config (60s timeout, forks pool)
├── .env.example           # Template: OPENROUTER_API_KEY=
├── .gitignore             # Ignore .env, tmp/, node_modules/, dist/
├── scripts/
│   ├── setup-chapter.ts   # Create temp chapter workspace from fixtures
│   └── teardown-chapter.ts # Clean up temp chapter (Docker stop + rm)
├── fixtures/
│   └── test-chapter/      # (Change 7 -- empty directory placeholder)
└── tests/                 # (Change 8 -- empty directory placeholder)
```

### Setup Script (`scripts/setup-chapter.ts`)

The setup script creates a temporary chapter workspace by invoking the chapter CLI binary:

1. **Create temp directory** at `e2e/tmp/chapter-e2e-<timestamp>/` (configurable via `E2E_WORKSPACE_DIR` env var)
2. **Copy fixture packages** from `e2e/fixtures/test-chapter/` into the temp directory's workspace directories (apps/, tasks/, skills/, roles/, members/)
3. **Write root package.json** with workspaces configuration (or copy from fixture if present)
4. **Run `npm install`** to resolve workspace dependencies (including chapter-core)
5. **Call `node bin/chapter.js init`** to initialize `.chapter/` directory
6. **Call `node bin/chapter.js install <member>`** for each member discovered in fixtures
7. **Save workspace path** to `e2e/tmp/.last-workspace` for teardown and tests
8. **Print workspace path** for manual inspection

The script invokes chapter via `node bin/chapter.js` using a relative path from the e2e root to the project root binary. This avoids needing `runInit()`/`runInstall()` to be exported from the main package entry point (they are internal CLI functions, not part of the public API).

Key design decisions:
- Temp directories are created under `e2e/tmp/` (gitignored) rather than system `/tmp/` for easy developer inspection
- The workspace path is stored in a `.last-workspace` file so teardown and tests can find it
- Setup is idempotent -- if the workspace already exists, it's removed and recreated
- Graceful fallback: if fixtures don't exist, creates an empty workspace structure with a helpful message

### Teardown Script (`scripts/teardown-chapter.ts`)

The teardown script cleanly removes the test chapter:

1. **Read workspace path** from `e2e/tmp/.last-workspace` or `E2E_WORKSPACE_DIR` env var
2. **Stop Docker Compose** if a `docker-compose.yml` exists in any member directory (runs `docker compose down --remove-orphans` per member with 30s timeout)
3. **Remove temp directory** recursively
4. **Remove `.last-workspace`** tracking file

Handles edge cases:
- No workspace to tear down (no `.last-workspace` and no env var)
- Workspace directory already removed (cleans up tracking file)
- Docker Compose not running (warns but continues)

### Root Workspace Integration

The root `package.json` adds `"e2e"` to its `workspaces` array:

```json
{
  "workspaces": ["chapter-core", "e2e"]
}
```

This means `npm install` at the root also installs e2e's dependencies (vitest, tsx, dotenv). The chapter package's exports are available to e2e tests via the workspace symlink in node_modules.

### Vitest Configuration

The E2E vitest config differs from the main project's config:
- **Timeout**: 60 seconds per test (E2E tests may run Docker operations)
- **Pool**: `forks` (not threads) since E2E tests do filesystem I/O and spawn processes
- **File parallelism**: disabled (E2E tests share workspace state)
- **Include**: `tests/**/*.test.ts`

## Decisions

1. **No explicit `@clawmasons/chapter` dependency**: The root package IS `@clawmasons/chapter`. npm does not support workspace self-references (`workspace:*` or `*` both fail). Since the e2e package is in the workspaces array, the chapter package is available via symlink -- no explicit dependency needed.

2. **Scripts use CLI binary, not programmatic API**: `runInit()` and `runInstall()` are not exported from the main package entry point -- they are internal to `src/cli/commands/`. The setup script calls `node bin/chapter.js` directly using relative path resolution. This is reliable, avoids exposing internal APIs, and exercises the same code path users would use.

3. **Temp directory under e2e/tmp/**: Using a subdirectory within the e2e package (not system /tmp/) makes it easy for developers to inspect generated files. The `tmp/` directory is gitignored.

4. **dotenv for API keys**: Scripts and tests use the `dotenv` package to load `.env` files. The `.env.example` provides the template. This follows the same pattern as the main project's `.env.example` generation.

5. **Fixture copying deferred to Change 7**: This change creates the package structure and script infrastructure. The actual fixture packages (test-note-taker member) are added in Change 7. The setup script handles the case where fixtures don't exist yet gracefully.
