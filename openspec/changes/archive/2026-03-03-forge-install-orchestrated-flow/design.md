## Context

The forge pipeline has all the building blocks implemented as pure functions:

- `discoverPackages()` + `resolveAgent()` → `ResolvedAgent`
- `validateAgent()` → `ValidationResult`
- `generateProxyConfig()` → `ProxyConfig`
- `claudeCodeMaterializer.materializeWorkspace()` → `MaterializationResult` (Map of paths → content)
- `claudeCodeMaterializer.generateDockerfile()` → string
- `claudeCodeMaterializer.generateComposeService()` → `ComposeServiceDef`
- `generateDockerCompose()` → YAML string
- `generateEnvTemplate()` → .env string
- `generateLockFile()` → `LockFile`

All functions are pure — they return content, not write files. The install command is the orchestration layer that calls them in sequence and writes the results to disk. It also handles the one runtime concern none of the pure functions cover: generating a random proxy auth token.

## Goals / Non-Goals

**Goals:**
- Wire all existing pipeline stages into a single `forge install <agent>` command
- Write all generated artifacts to a structured output directory
- Generate a random `FORGE_PROXY_TOKEN` and inject it into the `.env` file
- Support `--output-dir` for custom output location
- Provide clear progress output and error messages
- Make re-running install idempotent (overwrites existing files)

**Non-Goals:**
- Running `npm install` for the agent package (deferred — currently assumes packages are already in the workspace)
- Interactive credential prompting (deferred — generates `.env` template with placeholder values)
- Secrets manager integration (future change)
- Codex materializer (separate change — the install command only materializes runtimes with registered materializers)

## Decisions

### 1. Materializer registry: simple map lookup

A `Map<string, RuntimeMaterializer>` maps runtime names to materializer instances. Currently only `"claude-code"` is registered. If an agent declares a runtime with no registered materializer, install logs a warning and skips that runtime rather than failing. This allows partial installs where some runtimes aren't yet supported.

**Alternative:** Fail on unknown runtimes. Rejected because it blocks agents declaring future runtimes like `"codex"` from being installed at all.

### 2. Output directory: `.forge/agents/{short-name}/` by default

The scaffolded directory lives inside the forge workspace's `.forge/agents/` directory. This keeps generated artifacts separate from source packages and follows the pattern set by `forge init` creating `.forge/`. The `--output-dir` flag allows override for custom layouts.

### 3. Token generation: `crypto.randomBytes(32).toString('hex')`

A 64-character hex string generated via Node's built-in `crypto.randomBytes`. No external dependency needed. The token is written directly into the `.env` file's `FORGE_PROXY_TOKEN=` line, replacing the empty placeholder from `generateEnvTemplate()`.

### 4. File writing: create directories recursively, overwrite existing files

Uses `fs.mkdirSync({ recursive: true })` for all parent directories and `fs.writeFileSync` for files. Re-running install overwrites all generated files (idempotent). No backup or diff logic — the lock file captures the state.

### 5. Exported `runInstall()` function for testability

Following the pattern from `validate.ts`, the core logic lives in an exported `runInstall(rootDir, agentName, options)` function. The CLI action handler just calls it with `process.cwd()`. Tests call `runInstall()` directly with temp directories.

## Risks / Trade-offs

- **[No npm install delegation]** → The command does not run `npm install` for the agent package. Users must have the agent and its dependencies already in the workspace via manual `npm install` or workspace linking. Mitigation: clear error message if packages are not found.
- **[Skipping unknown runtimes]** → If an agent declares `"codex"` but no codex materializer is registered, that runtime is silently skipped with a warning. The user gets a partial install. Mitigation: the warning message clearly states which runtimes were skipped and why.
- **[No credential prompting]** → The `.env` template has empty values. Users must fill them in manually. Mitigation: the success output lists required variables and reminds the user to fill `.env`.
