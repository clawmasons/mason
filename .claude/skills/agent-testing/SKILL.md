---
name: agent-testing
description: How to create test workspaces, run agents, and write e2e tests.
---

# Agent Testing

## 1. Create a test workspace

The `scripts/create-test-dir.ts` script creates a workspace from the `claude-test-project` fixture.

```bash
npx tsx scripts/create-test-dir.ts [output-dir]
```

**What it does:**
- Copies the `packages/agent-sdk/fixtures/claude-test-project/` fixture via `copyFixtureWorkspace`
- If no output dir is given, creates a timestamped temp directory (`$TMPDIR/mason-e2e-test-dir-<timestamp>`)

Agents are **auto-linked by `mason.js`** at runtime: when mason.js detects a `.mason/` directory in the workspace, it symlinks the built-in `mcp-agent` and all agents from the sibling `mason-extensions/agents/` repo. No manual linking is needed.

**Workspace structure after creation:**

```
<workspace>/
  package.json          # from fixture
  apps/
  tasks/
  skills/
  roles/
  agents/
  .mason/
    node_modules/
      @clawmasons/
        mcp-agent -> <monorepo>/packages/mcp-agent   # symlink
        <agent>   -> <installed-path>                 # symlinks
  .claude/
```

## 2. Run agents in the test workspace

```bash
# Basic run with a prompt (print mode)
node scripts/mason.js run --agent <name> -p "your prompt"  --workspace <dir>

# With a role
node scripts/mason.js run --role writer --agent <name> -p "your prompt" --workspace <dir>
```

Session logs are written to `<workspace>/.mason/logs/session.log`.

## 3. E2e test pattern

Agent e2e tests follow a **setup / execute / assert / cleanup** pattern. The canonical examples are in `mason-extensions/agents/*/tests/e2e/agent.test.ts`.

### Imports

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import {
  copyFixtureWorkspace,
  MASON_BIN,
  isDockerAvailable,
  testIfProcessAndDockerStopped,
  stopProcessAndDocker,
  testSessionLogContains,
  testFileContents,
} from "@clawmasons/agent-sdk/testing";
```

### Setup (`beforeAll`)

```ts
let workspaceDir: string;
let lastProc: ChildProcess | null = null;

beforeAll(() => {
  if (!canRun()) return;

  // 1. Copy the shared fixture (agents are auto-linked by mason.js at runtime)
  workspaceDir = copyFixtureWorkspace("my-agent", {
    fixture: "claude-test-project",
  });

  // 2. (Optional) Create extra directories needed by MCP servers
  fs.mkdirSync(path.join(workspaceDir, "notes"), { recursive: true });
}, 30_000);
```

### Execute (spawn `mason run`)

```ts
function runMasonPrint(
  args: string[],
  cwd: string,
  timeoutMs: number = 300_000,
): Promise<{ proc: ChildProcess; stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    const proc = spawn("node", [MASON_BIN, ...args], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";
    proc.stdout!.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr!.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve({ proc, stdout, stderr, exitCode: null });
    }, timeoutMs);

    proc.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ proc, stdout, stderr, exitCode: code });
    });
  });
}
```

### Assert

```ts
it("executes a prompt", async () => {
  const { proc, stdout, exitCode } = await runMasonPrint(
    ["run", "--agent", "my-agent", "-p", "what is 2+2?"],
    workspaceDir,
  );
  lastProc = proc;

  expect(exitCode).toBe(0);
  expect(stdout.trim()).toBe("4");

  // Check session log
  testSessionLogContains(workspaceDir, '"type":"result"');

  // Check file artifacts
  testFileContents(workspaceDir, "notes/output.md", "expected content");

  // Verify process and Docker stopped
  testIfProcessAndDockerStopped(proc.pid!, workspaceDir);
}, 300_000);
```

### Cleanup (`afterAll`)

```ts
afterAll(async () => {
  await stopProcessAndDocker(lastProc, workspaceDir);
}, 120_000);
```

`stopProcessAndDocker` kills the CLI process, tears down Docker Compose sessions, and removes the workspace directory.

## 4. Workspace locations and debugging

| Source | Location pattern |
|---|---|
| `copyFixtureWorkspace(name)` | `$TMPDIR/mason-e2e-<name>-<timestamp>` |
| `create-test-dir.ts [dir]` | Specified path, or same temp pattern |

**Preserve workspaces for debugging:**

```bash
MASON_TEST_KEEP_WORKSPACE=1 npx vitest run --config packages/<name>/vitest.e2e.config.ts
```

When set, `stopProcessAndDocker()` skips deletion and prints the preserved path to stdout.

## 5. Environment requirements

| Variable | Required by |
|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | claude-code-agent |
| `OPENAI_API_KEY` | codex-agent |
| `OPENROUTER_API_KEY` | agents using OpenRouter |

**Docker** must be running for full e2e tests. Use the `isDockerAvailable()` guard:

```ts
function canRun(): boolean {
  return isDockerAvailable() && !!process.env.MY_API_KEY;
}

it("my test", async () => {
  if (!canRun()) return;
  // ...
});
```

## Key files

- `scripts/create-test-dir.ts` — convenience script for manual test workspaces
- `packages/agent-sdk/src/testing/index.ts` — test utilities (`copyFixtureWorkspace`, `masonExec`, `MASON_BIN`, etc.)
- `packages/agent-sdk/fixtures/claude-test-project/` — shared fixture
- `mason-extensions/agents/claude-code-agent/tests/e2e/agent.test.ts` — canonical e2e pattern
- `mason-extensions/agents/codex-agent/tests/e2e/agent.test.ts` — e2e pattern with --source flag
