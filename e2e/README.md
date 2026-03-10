# E2E Tests

End-to-end tests for chapter materialization and Docker Compose generation.

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

#### Running agents manually

After `npm run setup`, you can run agents from the built workspace. Pin the workspace to a known path for convenience:

```bash
# Build and set up the workspace
E2E_WORKSPACE_DIR=./tmp/my-test npm run setup
cd tmp/my-test
```

Run the **note-taker** agent with Docker Compose (requires Docker and `OPENROUTER_API_KEY`):

```bash
# From the workspace directory
chapter run-agent test-note-taker writer
```

Run the **mcp-test** agent as an ACP endpoint (no Docker needed):

```bash
# Start the ACP proxy on port 3001 (proxy on 3000)
chapter run-acp-agent --role mcp-test

# Or specify agent explicitly and custom ports
chapter run-acp-agent --agent @test/agent-mcp-test --role mcp-test --port 3001 --proxy-port 3000
```

Inspect the built artifacts:

```bash
ls docker/                     # Generated Dockerfiles and compose
cat chapter.lock.json          # Resolved dependency graph
ls dist/                       # Packed tarballs
chapter list                   # Show resolved agent tree
chapter validate               # Validate the workspace
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

#### Running specific test suites

Run only the pi-runtime build tests (build, Docker, materialization, validation):

```bash
npx vitest run tests/build-pi-runtime.test.ts
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
npx vitest run -t "note-taker"
npx vitest run -t "ACP"
```
