/**
 * E2E Test: MCP Agent ↔ Proxy communication via CLI
 *
 * Validates the full agent→proxy pipeline by:
 *   1. Copying the claude-test-project fixture
 *   2. Spawning `mason run --role writer --agent mcp` with piped stdio
 *   3. Interacting with the mcp-agent REPL to list and call tools
 *
 * The test does NOT manually orchestrate Docker containers — the CLI handles
 * all infrastructure (proxy, credential service, agent container).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import {
  copyFixtureWorkspace,
  MASON_BIN,
  isDockerAvailable,
} from "./helpers.js";

// ── stdout helpers ──────────────────────────────────────────────────────

/**
 * Collect stdout output until a predicate matches on the accumulated text.
 */
function waitForOutput(
  proc: ChildProcess,
  predicate: (accumulated: string) => boolean,
  timeoutMs: number = 60_000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let accumulated = "";

    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `Timed out after ${timeoutMs}ms waiting for output.\nAccumulated stdout:\n${accumulated}`,
        ),
      );
    }, timeoutMs);

    function onData(chunk: Buffer) {
      accumulated += chunk.toString();
      if (predicate(accumulated)) {
        cleanup();
        resolve(accumulated);
      }
    }

    function cleanup() {
      clearTimeout(timer);
      proc.stdout!.removeListener("data", onData);
    }

    proc.stdout!.on("data", onData);
  });
}

/**
 * Send a line to the process stdin and wait for a response containing
 * the given marker string in stdout.
 */
async function sendAndWaitFor(
  proc: ChildProcess,
  input: string,
  marker: string,
  timeoutMs: number = 60_000,
): Promise<string> {
  const outputPromise = waitForOutput(
    proc,
    (text) => text.includes(marker),
    timeoutMs,
  );
  proc.stdin!.write(input + "\n");
  return outputPromise;
}

// ── Test Suite ──────────────────────────────────────────────────────────

describe("mcp-proxy-agent: agent↔proxy via CLI", () => {
  let workspaceDir: string;
  let cliProcess: ChildProcess | null = null;

  beforeAll(() => {
    if (!isDockerAvailable()) return;

    workspaceDir = copyFixtureWorkspace("mcp-proxy-agent", {
      fixture: "claude-test-project",
    });

    // Create notes directory required by the filesystem MCP server
    fs.mkdirSync(path.join(workspaceDir, "notes"), { recursive: true });
  }, 30_000);

  afterAll(async () => {
    // Kill the CLI process (it will attempt its own cleanup)
    if (cliProcess && !cliProcess.killed) {
      cliProcess.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 3_000));
      if (!cliProcess.killed) {
        cliProcess.kill("SIGKILL");
      }
    }

    // Best-effort: tear down any leftover docker compose sessions
    if (workspaceDir) {
      const sessionsDir = path.join(workspaceDir, ".mason", "sessions");
      if (fs.existsSync(sessionsDir)) {
        for (const sessionId of fs.readdirSync(sessionsDir)) {
          const composeFile = path.join(sessionsDir, sessionId, "docker", "docker-compose.yml");
          if (fs.existsSync(composeFile)) {
            try {
              execSync(
                `docker compose -f "${composeFile}" down --rmi local --volumes`,
                { stdio: "pipe", timeout: 60_000 },
              );
            } catch { /* best-effort cleanup */ }
          }
        }
      }
    }

    if (workspaceDir && fs.existsSync(workspaceDir)) {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 120_000);

  it("starts agent via CLI, lists tools, and calls tools via REPL", async () => {
    if (!isDockerAvailable()) return;

    // Spawn the CLI with piped stdio — this handles everything:
    // auto-build, proxy startup, credential service, agent container
    cliProcess = spawn(
      "node",
      [MASON_BIN, "run", "--role", "writer", "--agent", "mcp"],
      {
        cwd: workspaceDir,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          // TEST_TOKEN is a declared credential — the credential service
          // picks it up from the CLI's env and serves it to the agent
          TEST_TOKEN: "e2e-test-token",
        },
      },
    );

    // Capture stderr for diagnostics
    let stderrOutput = "";
    cliProcess.stderr!.on("data", (chunk: Buffer) => {
      stderrOutput += chunk.toString();
    });

    cliProcess.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        console.error(`CLI exited with code ${code}. stderr:\n${stderrOutput}`);
      }
    });

    // --- Wait for the REPL to be ready ---
    // The CLI prints status messages, then the mcp-agent REPL prints "> "
    const readyOutput = await waitForOutput(
      cliProcess,
      (text) => text.includes("> "),
      180_000, // includes docker build + proxy startup + credential resolution
    );

    expect(readyOutput).toContain("[mcp-agent]");

    console.log(readyOutput);
    
    // --- Step 1: List available tools ---
    // Wait for tool names in the output (not just "> " which may arrive first)
    const listOutput = await sendAndWaitFor(
      cliProcess,
      "list",
      "read_file",
      30_000,
    );

    expect(listOutput).toContain("read_file");
    expect(listOutput).toContain("write_file");
    expect(listOutput).toContain("list_directory");
    expect(listOutput).toContain("create_directory");

    // --- Step 2: Call create_directory tool ---
    const createDirOutput = await sendAndWaitFor(
      cliProcess,
      'filesystem_create_directory {"path": "./notes/test-subdir"}',
      "Result:",
      30_000,
    );

    expect(createDirOutput).toContain("Result:");

    // --- Step 3: Call write_file tool ---
    const writeOutput = await sendAndWaitFor(
      cliProcess,
      'filesystem_write_file {"path": "./notes/test-subdir/hello.txt", "content": "Hello from e2e test!"}',
      "Result:",
      30_000,
    );

    expect(writeOutput).toContain("Result:");

    // --- Step 4: Call read_file to verify round-trip ---
    const readOutput = await sendAndWaitFor(
      cliProcess,
      'filesystem_read_file {"path": "./notes/test-subdir/hello.txt"}',
      "Hello from e2e test!",
      30_000,
    );

    expect(readOutput).toContain("Hello from e2e test!");

    // --- Step 5: Exit gracefully ---
    cliProcess.stdin!.write("exit\n");

    // Wait for the CLI to finish its teardown
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => resolve(), 30_000);
      cliProcess!.on("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }, 300_000);
});
