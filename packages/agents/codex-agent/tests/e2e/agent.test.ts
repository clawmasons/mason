/**
 * E2E Test: Codex Agent — print mode via CLI with --source claude
 *
 * Validates the codex-agent print mode pipeline by:
 *   1. Copying the claude-test-project fixture
 *   2. Running `mason run --agent codex --source claude --build -p <prompt>`
 *   3. Verifying stdout output and file artifacts
 *
 * Requires:
 *   - Docker daemon running
 *   - OPENAI_API_KEY env var set
 */

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
  testFileContents,
} from "@clawmasons/agent-sdk/testing";

// ── Helpers ──────────────────────────────────────────────────────────────

const hasOpenAIKey = !!process.env.OPENAI_API_KEY;

function canRun(): boolean {
  return isDockerAvailable() && hasOpenAIKey;
}

/**
 * Spawn mason in print mode and wait for it to exit.
 * Returns the child process (for pid inspection) and captured output.
 */
function runMasonPrint(
  args: string[],
  cwd: string,
  timeoutMs: number = 300_000,
): Promise<{ proc: ChildProcess; stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    const proc = spawn("node", [MASON_BIN, ...args], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        TEST_TOKEN: "e2e-test-token",
      },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout!.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr!.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

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

// ── Test Suite ──────────────────────────────────────────────────────────

describe("codex-agent: print mode via CLI with --source claude", () => {
  let workspaceDir: string;
  let lastProc: ChildProcess | null = null;

  beforeAll(() => {
    if (!canRun()) return;

    workspaceDir = copyFixtureWorkspace("codex-agent", {
      fixture: "claude-test-project",
    });

    // Create notes directory required by the filesystem MCP server
    fs.mkdirSync(path.join(workspaceDir, "notes"), { recursive: true });
  }, 30_000);

  afterAll(async () => {
    await stopProcessAndDocker(lastProc, workspaceDir);
  }, 120_000);

  it("executes a prompt and returns the result", async () => {
    if (!canRun()) return;

    const { proc, stdout, stderr, exitCode } = await runMasonPrint(
      ["run", "--agent", "codex", "--source", "claude", "--build", "-p", "what is 2+2 equal? reply with just the number"],
      workspaceDir,
    );
    lastProc = proc;

    if (exitCode !== 0) {
      console.error(`CLI exited with code ${exitCode}. stderr:\n${stderr}`);
    }

    // Print mode should output the result containing "4"
    expect(stdout).toContain("4");

    // Process and Docker should have stopped after print mode
    testIfProcessAndDockerStopped(proc.pid!, workspaceDir);
  }, 300_000);

  it("writes a file via MCP tool", async () => {
    if (!canRun()) return;

    const { proc, stderr, exitCode } = await runMasonPrint(
      [
        "run", "--role", "writer", "--agent", "codex", "--source", "claude", "--build",
        "-p", "use the take-notes task to write a file called test-file.md in the notes directory with the contents 'test-passed'. Use the mason_write_file tool.",
      ],
      workspaceDir,
    );
    lastProc = proc;

    if (exitCode !== 0) {
      console.error(`CLI exited with code ${exitCode}. stderr:\n${stderr}`);
    }

    // The file should have been created in the notes directory
    testFileContents(workspaceDir, "notes/test-file.md", "test-passed");

    // Process and Docker should have stopped after print mode
    testIfProcessAndDockerStopped(proc.pid!, workspaceDir);
  }, 300_000);
});
