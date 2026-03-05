## Context

forge is a TypeScript/Node.js project (ESM, Zod schemas, Vitest) with validated package type schemas but no CLI. The next step is adding the CLI entry point and the first command (`forge init`). The project uses `@clawforge/forge` as its npm name, targets ES2022/Node16, and has no runtime dependencies beyond Zod.

The PRD specifies Commander.js for CLI parsing (§5.1) and defines the `forge init` output in §5.2 and §4. The workspace structure uses npm workspaces with type-organized directories.

## Goals / Non-Goals

**Goals:**
- Establish the CLI framework that all future commands plug into
- Implement `forge init` to scaffold a complete, ready-to-use monorepo workspace
- Make the CLI installable globally via `npm install -g` or runnable via `npx`
- Handle edge cases: existing workspace detection, directory name inference

**Non-Goals:**
- Other CLI commands (add, remove, build, install, run, stop, list, permissions, validate, publish) — those are separate changes
- Interactive prompts during init (no inquirer-style wizards for now)
- Template customization or plugin-based scaffolding

## Decisions

### 1. CLI Architecture: Single entry point with command modules

**Decision:** Create `src/cli/index.ts` as the Commander.js program root, with each command in its own module under `src/cli/commands/`. The `bin/forge.js` file is a thin shebang wrapper that imports the CLI module.

**Rationale:** This mirrors Commander.js best practices and keeps commands isolated. Each future command (add, build, install, etc.) drops into `src/cli/commands/` without touching the entry point. The alternative — a single monolithic CLI file — doesn't scale to the 12+ commands in the PRD.

### 2. Bin entry: Thin ESM wrapper

**Decision:** `bin/forge.js` is a `#!/usr/bin/env node` script that imports `../dist/cli/index.js` and calls `run()`. It lives outside `src/` and is not compiled by TypeScript.

**Rationale:** npm requires the `bin` field to point to a JavaScript file, not a TypeScript file. A thin wrapper avoids needing a build step just to run the CLI during development (we can use `tsx` for dev). The wrapper is stable — it never changes as commands are added.

### 3. Workspace detection: Check for `.forge/` directory

**Decision:** `forge init` detects an existing workspace by checking for a `.forge/` directory in the target path. If found, it warns and exits (non-destructive). No `--force` flag in this change.

**Rationale:** The `.forge/` directory is the canonical marker of a forge workspace (PRD §5.2). Checking `package.json` alone is insufficient since any npm project has one. A `--force` flag can be added later if users need to re-scaffold.

### 4. Default config values in `.forge/config.json`

**Decision:** The initial `.forge/config.json` contains minimal defaults: `{ "version": "0.1.0" }`. It's a placeholder for future workspace-level configuration (secrets provider, default registry, etc.).

**Rationale:** The PRD mentions `.forge/config.json` but doesn't specify its schema yet. Starting minimal avoids locking in structure prematurely. Future changes will extend this as config needs emerge.

### 5. Testing strategy: Filesystem integration tests with temp directories

**Decision:** Tests use Node.js `fs.mkdtemp` to create temporary directories, run the init logic programmatically (not via child_process), and assert on the resulting file tree. Cleanup happens in `afterEach`.

**Rationale:** Testing the actual filesystem output is the only way to verify scaffolding correctness. Programmatic invocation (importing the init function directly) is faster and more reliable than spawning `forge init` as a subprocess. We test the command logic, not Commander.js's argument parsing.

## Risks / Trade-offs

- **Commander.js as new runtime dependency** → Acceptable. Commander is the most widely used Node.js CLI framework (~100M weekly downloads), zero transitive dependencies, and explicitly called out in the PRD. No lighter alternative provides the same command routing + help generation.
- **ESM compatibility with bin scripts** → Node.js 18+ handles ESM bin scripts natively. The `#!/usr/bin/env node` shebang works. We require Node 18+ (already implicit from ES2022 target).
- **No interactive prompts** → Users who want a custom package name must use `--name`. This keeps the command scriptable and CI-friendly. Interactive mode can be layered on later.
