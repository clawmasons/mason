## Architecture

The E2E test exercises the full `chapter install` pipeline against real fixture packages. It creates a temporary workspace, copies fixtures, runs `npm install` + `chapter init` + `chapter install`, and then asserts on the generated output files.

### Test File Structure

```
e2e/tests/note-taker-pi.test.ts
```

A single test file with one top-level `describe` block. Tests are organized by what they validate:

1. **Workspace materialization** -- file existence and content in the pi-coding-agent workspace directory
2. **Docker Compose generation** -- service definition, environment variables, dependencies
3. **Env configuration** -- `.env` file contents (proxy token, LLM API key)
4. **Infrastructure** (gated) -- proxy connectivity and task execution requiring Docker/API keys

### Setup and Teardown

The test uses vitest's `beforeAll` / `afterAll` hooks to manage the workspace lifecycle:

```typescript
let workspaceDir: string;
let memberOutputDir: string;

beforeAll(() => {
  // 1. Create temp workspace
  workspaceDir = path.join(e2eRoot, "tmp", `chapter-e2e-${Date.now()}`);

  // 2. Copy fixture root package.json and workspace directories
  // (copies apps/, tasks/, skills/, roles/, members/ from fixtures)

  // 3. Symlink @clawmasons/chapter-core into node_modules
  //    chapter-core is a local workspace package (not published to npm),
  //    so we create a symlink instead of running npm install.
  const nmScopePath = path.join(workspaceDir, "node_modules", "@clawmasons");
  fs.mkdirSync(nmScopePath, { recursive: true });
  fs.symlinkSync(chapterCoreDir, path.join(nmScopePath, "chapter-core"));

  // 4. Run chapter init
  execFileSync("node", [chapterBin, "init"], { cwd: workspaceDir });

  // 5. Run chapter install @test/member-test-note-taker
  execFileSync("node", [chapterBin, "install", "@test/member-test-note-taker"], { cwd: workspaceDir });

  // 6. Determine member output directory
  memberOutputDir = path.join(workspaceDir, ".chapter", "members", "test-note-taker");
}, 120_000); // 2 minute timeout for setup

afterAll(() => {
  if (workspaceDir && fs.existsSync(workspaceDir)) {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  }
});
```

The setup copies both the root `package.json` and the member fixture directory from `e2e/fixtures/test-chapter/`. Instead of running `npm install` (which would fail because `@clawmasons/chapter-core` is not published to npm), the test creates a symlink to the monorepo's local `chapter-core/` directory. This allows `discoverPackages()` to find the role/task/skill/app packages via `node_modules/@clawmasons/chapter-core/`.

### Test Categories

#### Category 1: Workspace Materialization (Always Run)

These tests read files from `memberOutputDir/pi-coding-agent/workspace/` and assert on their existence and content:

- **AGENTS.md exists** -- verifies the shared AGENTS.md generation works through the install pipeline
- **AGENTS.md content** -- contains role-writer context, agent name, permitted tools
- **.pi/settings.json exists and has correct model** -- verifies `openrouter/anthropic/claude-sonnet-4`
- **.pi/extensions/chapter-mcp/index.ts exists** -- extension TypeScript module
- **.pi/extensions/chapter-mcp/package.json exists** -- extension package metadata
- **Extension code registers MCP server** -- contains `pi.registerMcpServer(`
- **Extension code registers take-notes command** -- contains `pi.registerCommand(` with `take-notes` name
- **Extension code has baked proxy token** -- contains `Bearer` with a hex token, not `process.env` placeholder
- **skills/ directory has markdown-conventions** -- `skills/markdown-conventions/README.md` exists

#### Category 2: Docker Compose (Always Run)

These tests read `memberOutputDir/docker-compose.yml`:

- **docker-compose.yml exists** -- file presence check
- **Contains pi-coding-agent service** -- `pi-coding-agent:` appears in YAML
- **Service builds from ./pi-coding-agent** -- `build: ./pi-coding-agent`
- **Service depends on mcp-proxy** -- `depends_on` contains `mcp-proxy`
- **Service includes OPENROUTER_API_KEY** -- environment list includes the key

#### Category 3: Env Configuration (Always Run)

These tests read `memberOutputDir/.env`:

- **.env exists** -- file presence check
- **.env contains OPENROUTER_API_KEY** -- template includes the LLM provider key
- **.env contains CHAPTER_PROXY_TOKEN with value** -- token is generated (not empty)

#### Category 4: Dockerfile (Always Run)

These tests read `memberOutputDir/pi-coding-agent/Dockerfile`:

- **Dockerfile exists** -- file presence check
- **Installs pi-coding-agent** -- contains `npm install -g @mariozechner/pi-coding-agent`
- **Uses pi CMD** -- contains `pi --no-session --mode print`

#### Category 5: Infrastructure (Gated)

These tests require Docker and/or API keys and skip gracefully when unavailable:

- **Proxy connectivity** -- skips if Docker is not available (`docker info` fails)
- **Task execution** -- skips if `OPENROUTER_API_KEY` is not set in environment

Infrastructure tests are included as placeholder `it.skip` blocks with descriptive comments for future implementation, rather than complex conditional logic. This keeps the test file clean and signals intent without requiring Docker in CI.

### Key Design Decisions

1. **Inline setup, not shared script**: The test manages its own setup/teardown rather than calling `npm run setup`. This ensures test isolation and avoids state leakage between runs.

2. **Copy fixtures directly**: Rather than symlinking or referencing fixtures in-place, the test copies them to a temp directory. This matches how a real user would work (copy a template, install, run).

3. **120-second timeout**: `npm install` in the workspace can be slow due to dependency resolution. The beforeAll hook gets a generous timeout.

4. **No mocking**: This is an E2E test -- it runs the real `chapter` CLI binary, real npm install, real file generation. No mocks, no stubs.

5. **Skip infrastructure tests**: Docker and API key tests are `it.skip` placeholders. They document what should be tested when infrastructure is available but don't block CI.

## Decisions

1. **Single test file**: All note-taker-pi tests live in one file. The fixture is the same, the setup is the same, splitting would add overhead with no benefit.

2. **Direct filesystem assertions**: Tests read generated files with `fs.readFileSync` and assert on content. No snapshot testing -- explicit string/JSON assertions are more maintainable and debuggable.

3. **Assert on both existence and content**: Every file gets an existence check AND a content check. This catches both "file missing" and "file generated with wrong content" failures separately.
