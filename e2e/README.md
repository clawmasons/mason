# E2E Tests

End-to-end tests for role materialization, Docker Compose generation, and the role-based pipeline.

## Manual Setup & Teardown

### Prerequisites

```bash
cd e2e
npm install
```

Optionally copy `.env.example` to `.env` and fill in values (e.g. `OPENROUTER_API_KEY` for live API tests).

### Setup a test environment

```bash
npm run setup
```

This creates a temporary workspace from the fixtures in `fixtures/test-chapter/`, runs `chapter init` and `chapter install` for each fixture member, and saves the workspace path to `.last-workspace`.

To use a custom directory instead of a temp directory:

```bash
E2E_WORKSPACE_DIR=/path/to/workspace npm run setup
```

#### Running roles manually

After `npm run setup`, you can run roles from the built workspace. Pin the workspace to a known path for convenience:

```bash
# Build and set up the workspace
E2E_WORKSPACE_DIR=./tmp/my-test npm run setup
cd tmp/my-test
```

Run the **note-taker** role with Docker Compose (requires Docker and `OPENROUTER_API_KEY`):

```bash
# From the workspace directory
clawmasons run claude --role test-writer
```

Run a role as an ACP endpoint (no Docker needed):

```bash
# Start the ACP proxy on port 3001 (proxy on 3000)
clawmasons run claude --role mcp-test --acp

# Or specify custom ports
clawmasons run claude --role mcp-test --acp --port 3001 --proxy-port 3000
```

Inspect the built artifacts:

```bash
ls .clawmasons/docker/             # Generated Dockerfiles and compose per role
cat chapter.lock.json              # Resolved dependency graph
ls dist/                           # Packed tarballs
clawmasons chapter list            # Show available roles
clawmasons chapter validate        # Validate role definitions
```

### Tear down

```bash
npm run teardown
```

This stops any running Docker Compose stacks in the workspace, removes the workspace directory, and cleans up `.last-workspace`.

### Run tests

```bash
npm test
```

Tests that require Docker or API keys skip gracefully when unavailable.

## Test Suites

| File | Description |
|------|-------------|
| `role-workflow.test.ts` | Local role discovery, list, validate, build (ROLE.md pipeline) |
| `cross-agent-materialization.test.ts` | Claude role parsing, metadata extraction, cross-agent output |
| `volume-masking.test.ts` | Container ignore paths and volume stacking |
| `error-paths.test.ts` | Missing roles, malformed ROLE.md, clear error messages |
| `build-pipeline.test.ts` | Full build pipeline: node_modules, Dockerfiles, MCP connectivity |
| `build-pi-runtime.test.ts` | Role-based build, lock file, workspace materialization |
| `docker-proxy.test.ts` | Docker proxy with ACP session metadata |
| `acp-client-spawn.test.ts` | ACP client bootstrap and spawn |
| `test-note-taker-mcp.test.ts` | Role-based proxy pipeline for note-taker |

#### Running specific test suites

Run only the role workflow tests:

```bash
npx vitest run tests/role-workflow.test.ts
```

Run only the full build pipeline tests (node_modules, Dockerfiles, MCP connectivity):

```bash
npx vitest run tests/build-pipeline.test.ts
```

Run only the Docker proxy tests with ACP session metadata:

```bash
npx vitest run tests/docker-proxy.test.ts
```

Run tests matching a name pattern:

```bash
npx vitest run -t "role"
npx vitest run -t "ACP"
```
