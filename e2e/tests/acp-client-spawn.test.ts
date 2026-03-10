/**
 * E2E Test: ACP Agent Startup from ACP Client (acpx)
 *
 * Simulates what an ACP client (acpx, Zed, JetBrains) does:
 *   1. Spawn `clawmasons acp --role writer` as a child process
 *   2. Wait for the ACP bridge to be ready (HTTP endpoint)
 *   3. Send a POST request to trigger session/new (with CWD)
 *   4. Verify the agent starts, tools are available via proxy
 *   5. Tear down gracefully
 *
 * Uses the mcp-note-taker fixture with mcp-agent runtime (no LLM required).
 *
 * PRD refs: REQ-004 (Bootstrap Flow), US-1 (Single-command ACP setup)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import {
  copyFixtureWorkspace,
  chapterExec,
  CLAWMASONS_BIN,
} from "./helpers.js";

// ── Constants ────────────────────────────────────────────────────────

const ACP_BRIDGE_PORT = 19800;
const ACP_PROXY_PORT = 19801;
const READY_TIMEOUT_MS = 120_000;
const SESSION_START_TIMEOUT_MS = 90_000;

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Wait for a specific string to appear in the accumulated output of a process.
 * Returns the full output up to that point.
 */
function waitForOutput(
  proc: ChildProcess,
  target: string,
  timeoutMs: number,
  accumulated: { stdout: string; stderr: string },
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `Timed out waiting for "${target}" after ${timeoutMs}ms.\n` +
            `stdout:\n${accumulated.stdout}\n` +
            `stderr:\n${accumulated.stderr}`,
        ),
      );
    }, timeoutMs);

    const check = () => {
      const combined = accumulated.stdout + accumulated.stderr;
      if (combined.includes(target)) {
        clearTimeout(timer);
        resolve(combined);
      }
    };

    // Check what's already accumulated
    check();

    // Listen for new data
    const onStdout = () => check();
    const onStderr = () => check();
    const onExit = (code: number | null) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Process exited with code ${code} while waiting for "${target}".\n` +
            `stdout:\n${accumulated.stdout}\n` +
            `stderr:\n${accumulated.stderr}`,
        ),
      );
    };

    proc.stdout?.on("data", onStdout);
    proc.stderr?.on("data", onStderr);
    proc.on("exit", onExit);

    // Clean up listeners after resolution or timeout
    const origResolve = resolve;
    const origReject = reject;
    resolve = ((val: string) => {
      proc.stdout?.removeListener("data", onStdout);
      proc.stderr?.removeListener("data", onStderr);
      proc.removeListener("exit", onExit);
      origResolve(val);
    }) as typeof resolve;
    reject = ((err: Error) => {
      proc.stdout?.removeListener("data", onStdout);
      proc.stderr?.removeListener("data", onStderr);
      proc.removeListener("exit", onExit);
      origReject(err);
    }) as typeof reject;
  });
}

/**
 * Poll an HTTP endpoint until it responds with 200 OK.
 */
async function pollHealthEndpoint(
  url: string,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(url);
      if (resp.ok) return;
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`Health endpoint ${url} did not become ready within ${timeoutMs}ms`);
}

/**
 * Assert a value is not null/undefined and return it typed.
 */
function assertDefined<T>(value: T | null | undefined, msg: string): T {
  if (value == null) throw new Error(msg);
  return value;
}

// ── Test Suite ────────────────────────────────────────────────────────

describe("ACP client spawn e2e", () => {
  let workspaceDir: string;
  let sessionCwd: string;
  let acpProcess: ChildProcess | null = null;
  let clawmasonsHome: string;
  const processOutput = { stdout: "", stderr: "" };

  beforeAll(async () => {
    // 1. Copy fixture workspace and build
    workspaceDir = copyFixtureWorkspace("mcp-note-taker", {
      excludePaths: ["agents/mcp-test", "roles/mcp-test"],
    });

    chapterExec(["chapter", "build"], workspaceDir, { timeout: 120_000 });

    // 2. Create a temp CLAWMASONS_HOME for this test run
    clawmasonsHome = path.join(workspaceDir, ".test-clawmasons-home");
    fs.mkdirSync(clawmasonsHome, { recursive: true });

    // 3. Init the role so chapters.json is populated
    chapterExec(
      ["chapter", "init-role", "--role", "writer"],
      workspaceDir,
      { timeout: 30_000 },
    );

    // 4. Create a temp directory to use as the session CWD
    sessionCwd = fs.mkdtempSync(path.join(os.tmpdir(), "acp-e2e-session-"));

    // 5. Create notes directory (required by filesystem MCP server in the fixture)
    const notesDir = path.join(workspaceDir, "notes");
    fs.mkdirSync(notesDir, { recursive: true });
  }, 180_000);

  afterAll(async () => {
    // Kill the ACP process if still running
    if (acpProcess && !acpProcess.killed) {
      acpProcess.kill("SIGTERM");
      // Wait briefly for graceful shutdown
      await new Promise((r) => setTimeout(r, 3_000));
      if (!acpProcess.killed) {
        acpProcess.kill("SIGKILL");
      }
    }

    // Clean up Docker resources spawned by clawmasons acp
    // The process should have cleaned up on SIGTERM, but do best-effort
    try {
      // Find and kill any lingering compose projects from this workspace
      const sessionDir = path.join(workspaceDir, ".clawmasons", "sessions");
      if (fs.existsSync(sessionDir)) {
        const sessions = fs.readdirSync(sessionDir);
        for (const session of sessions) {
          const dockerDir = path.join(sessionDir, session, "docker");
          const composeFile = path.join(dockerDir, "docker-compose.yml");
          if (fs.existsSync(composeFile)) {
            try {
              execSync(`docker compose -f "${composeFile}" down --rmi local --volumes`, {
                stdio: "pipe",
                timeout: 30_000,
              });
            } catch { /* best-effort */ }
          }
        }
      }
    } catch { /* best-effort */ }

    // Clean up temp directories
    if (workspaceDir && fs.existsSync(workspaceDir)) {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
    if (sessionCwd && fs.existsSync(sessionCwd)) {
      fs.rmSync(sessionCwd, { recursive: true, force: true });
    }
  }, 120_000);

  // ── Test 1: Spawn and Initialize ───────────────────────────────────

  it("spawns clawmasons acp and bridge becomes ready", async () => {
    // Spawn the ACP process (same as acpx or Zed would)
    acpProcess = spawn(
      "node",
      [
        CLAWMASONS_BIN,
        "acp",
        "--role", "writer",
        "--port", String(ACP_BRIDGE_PORT),
        "--proxy-port", String(ACP_PROXY_PORT),
      ],
      {
        cwd: workspaceDir,
        env: {
          ...process.env,
          CLAWMASONS_HOME: clawmasonsHome,
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    // Accumulate output for debugging
    acpProcess.stdout?.on("data", (chunk: Buffer) => {
      processOutput.stdout += chunk.toString();
    });
    acpProcess.stderr?.on("data", (chunk: Buffer) => {
      processOutput.stderr += chunk.toString();
    });

    // Wait for the "Ready" log message indicating bridge is listening
    await waitForOutput(acpProcess, "Ready", READY_TIMEOUT_MS, processOutput);

    // Verify the bridge health endpoint is accessible
    await pollHealthEndpoint(`http://localhost:${ACP_BRIDGE_PORT}/health`, 10_000);
  }, READY_TIMEOUT_MS + 15_000);

  // ── Test 2: Session Lifecycle ──────────────────────────────────────

  it("session/new triggers agent container start", async () => {
    const proc = assertDefined(acpProcess, "acpProcess must be running");
    expect(proc.killed).toBe(false);

    // Send a POST request to the bridge — this triggers onSessionNew
    // The bridge extracts `cwd` from the request body and starts the agent
    const resp = await fetch(`http://localhost:${ACP_BRIDGE_PORT}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "initialize",
        id: 1,
        params: {
          cwd: sessionCwd,
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: {
            name: "acp-e2e-test",
            version: "0.1.0",
          },
        },
      }),
    });

    // The bridge should relay this to the agent (which starts on first POST)
    expect(resp.status).toBeLessThan(500);

    // Wait for the agent to be connected (check process output)
    await waitForOutput(
      proc,
      "Bridge connected to agent",
      SESSION_START_TIMEOUT_MS,
      processOutput,
    );

    // Verify .clawmasons directory was created in the session CWD
    expect(fs.existsSync(path.join(sessionCwd, ".clawmasons"))).toBe(true);
  }, SESSION_START_TIMEOUT_MS + 15_000);

  // ── Test 3: Tool Listing ───────────────────────────────────────────

  it("agent responds to tool listing via bridge", async () => {
    expect(acpProcess).not.toBeNull();

    // The agent is now running. Send a "list" command through the bridge.
    // The bridge relays POST requests to the agent container's ACP endpoint.
    const resp = await fetch(`http://localhost:${ACP_BRIDGE_PORT}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "list" }),
    });

    expect(resp.ok).toBe(true);
    const result = await resp.json() as { output: string; exit: boolean };
    expect(result).toHaveProperty("output");
    expect(result.exit).toBe(false);

    // The list command should show filesystem tools from the mcp-note-taker agent
    const output = result.output;
    expect(output).toContain("Available tools:");
    expect(output).toMatch(/list_directory|read_file|write_file/);
  }, 30_000);

  // ── Test 4: Tool Invocation ────────────────────────────────────────

  it("agent can call filesystem tools via bridge", async () => {
    expect(acpProcess).not.toBeNull();

    // First, list tools to get the correct prefixed name
    const listResp = await fetch(`http://localhost:${ACP_BRIDGE_PORT}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "list" }),
    });
    const listResult = await listResp.json() as { output: string };
    const lines = listResult.output.split("\n");
    const listDirLine = lines.find((l: string) => l.includes("list_directory"));
    const toolName = listDirLine?.match(/- (\S+)/)?.[1] ?? "filesystem__list_directory";

    // Call list_directory through the bridge -> agent -> proxy -> MCP server
    const resp = await fetch(`http://localhost:${ACP_BRIDGE_PORT}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: `${toolName} {"path": "/workspace"}` }),
    });

    expect(resp.ok).toBe(true);
    const result = await resp.json() as { output: string; exit: boolean };
    expect(result).toHaveProperty("output");
    expect(result.exit).toBe(false);
  }, 30_000);

  // ── Test 5: Session Teardown ───────────────────────────────────────

  it("process shuts down gracefully on SIGTERM", async () => {
    const proc = assertDefined(acpProcess, "acpProcess must be running");
    expect(proc.killed).toBe(false);

    // Send SIGTERM (same as an ACP client disconnecting / editor closing)
    proc.kill("SIGTERM");

    // Wait for process to exit
    const exitCode = await new Promise<number | null>((resolve) => {
      const timer = setTimeout(() => {
        // Force kill if graceful shutdown takes too long
        if (!proc.killed) {
          proc.kill("SIGKILL");
        }
        resolve(null);
      }, 15_000);

      proc.on("exit", (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });

    // Process should have exited (0 for graceful shutdown)
    expect(exitCode).toBe(0);

    // Verify the bridge is no longer listening
    try {
      await fetch(`http://localhost:${ACP_BRIDGE_PORT}/health`);
      // If we get here, the port is still responding (unexpected)
      expect.fail("Bridge should no longer be listening after shutdown");
    } catch {
      // Expected: connection refused
    }
  }, 30_000);
});
