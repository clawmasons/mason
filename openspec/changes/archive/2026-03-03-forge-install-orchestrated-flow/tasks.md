## 1. Install Command Implementation

- [x] 1.1 Create `src/cli/commands/install.ts` with `registerInstallCommand()` and `runInstall()` functions
- [x] 1.2 Implement the install pipeline: discover → resolve → validate → generate proxy config → materialize runtimes → compose → env → lock → write files
- [x] 1.3 Implement materializer registry (Map of runtime name → RuntimeMaterializer) with claude-code pre-registered
- [x] 1.4 Implement proxy token generation via `crypto.randomBytes(32).toString('hex')`
- [x] 1.5 Implement file writing: create output directory structure, write all generated artifacts
- [x] 1.6 Add `--output-dir` option for custom output directory
- [x] 1.7 Add progress output and success summary with list of generated files and required env vars

## 2. CLI Registration

- [x] 2.1 Update `src/cli/commands/index.ts` to import and register the install command

## 3. Tests

- [x] 3.1 Create `tests/cli/install.test.ts` with test helpers (writePackage, setupValidAgent fixtures)
- [x] 3.2 Test: install command is registered with correct argument and options
- [x] 3.3 Test: successful install creates complete directory structure (mcp-proxy/config.json, claude-code/workspace/*, docker-compose.yml, .env, forge.lock.json)
- [x] 3.4 Test: generated proxy config has correct toolFilters
- [x] 3.5 Test: generated .env has FORGE_PROXY_TOKEN filled in (non-empty)
- [x] 3.6 Test: validation errors abort install with non-zero exit
- [x] 3.7 Test: unknown runtimes produce warning but don't fail
- [x] 3.8 Test: re-running install overwrites existing files (idempotent)
- [x] 3.9 Test: --output-dir writes to custom location
