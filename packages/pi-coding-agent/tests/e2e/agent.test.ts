/**
 * E2E Test: Pi Coding Agent — print mode via CLI
 *
 * Validates the pi-coding-agent print mode pipeline by:
 *   1. Copying the claude-test-project fixture
 *   2. Running `mason run --role writer --agent pi --source claude -p <prompt>`
 *   3. Verifying session logs and file artifacts
 *
 * Requires:
 *   - Docker daemon running
 *   - OPENROUTER_API_KEY env var set
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
  testSessionLogContains,
  testFileContents,
} from "@clawmasons/agent-sdk/testing";

// ── Helpers ──────────────────────────────────────────────────────────────

const hasOpenRouterKey = !!process.env.OPENROUTER_API_KEY;

function canRun(): boolean {
  return isDockerAvailable() && hasOpenRouterKey;
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

describe("pi-coding-agent: print mode via CLI", () => {
  let workspaceDir: string;
  let lastProc: ChildProcess | null = null;

  beforeAll(() => {
    if (!canRun()) return;

    workspaceDir = copyFixtureWorkspace("pi-coding-agent", {
      fixture: "claude-test-project",
    });

    // Create notes directory required by the filesystem MCP server
    fs.mkdirSync(path.join(workspaceDir, "notes"), { recursive: true });

    // Write pi-coding-agent LLM config (required by pi's validate())
    const configPath = path.join(workspaceDir, ".mason", "config.json");
    fs.writeFileSync(configPath, JSON.stringify({
      agents: {
        "pi-coding-agent": {
          config: {
            llm: {
              provider: "openrouter",
              model: "anthropic/claude-sonnet-4",
            },
          },
        },
      },
    }, null, 2));
  }, 30_000);

  afterAll(async () => {
    await stopProcessAndDocker(lastProc, workspaceDir);
  }, 120_000);

  it("executes a prompt and logs to session.log", async () => {
    if (!canRun()) return;

    const { proc, stdout, stderr, exitCode } = await runMasonPrint(
      ["run", "--role", "writer", "--agent", "pi", "--source", "claude", "-p", "what is 2+2 equal?"],
      workspaceDir,
    );
    lastProc = proc;

    if (exitCode !== 0) {
      console.error(`CLI exited with code ${exitCode}. stderr:\n${stderr}`);
    }

    // Print mode should output the result to stdout
    expect(stdout.trim()).toBe("4");

    // Session log should exist and contain evidence the agent ran
    testSessionLogContains(workspaceDir, '"agent_end"');

    // Process and Docker should have stopped after print mode
    testIfProcessAndDockerStopped(proc.pid!, workspaceDir);
  }, 300_000);

  it("writes a file via MCP tool", async () => {
    if (!canRun()) return;

    const { proc, stderr, exitCode } = await runMasonPrint(
      [
        "run", "--role", "writer", "--agent", "pi", "--source", "claude",
        "-p", "/take-notes write a file test-file.md with the contents 'test-passed'",
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
