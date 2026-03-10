/**
 * E2E Test: ACP Bootstrap via `clawmasons acp --chapter initiate`
 *
 * Tests the full bootstrap flow that an ACP client triggers:
 *   1. Spawn `clawmasons acp --chapter initiate --role chapter-creator`
 *   2. Verify lodge, chapter, and Docker artifacts are created
 *   3. Verify the ACP bridge becomes ready
 *   4. Send session/new to start the agent container
 *   5. Verify the agent responds to MCP tool requests
 *   6. Graceful shutdown
 *
 * Uses the mcp-agent runtime (no LLM token required).
 *
 * Environment:
 *   CLAWMASONS_HOME = e2e/tmp/clawmasons
 *   LODGE = "e2e"
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { CLAWMASONS_BIN, E2E_ROOT } from "./helpers.js";

// ── Constants ────────────────────────────────────────────────────────

const ACP_BRIDGE_PORT = 19800;
const ACP_PROXY_PORT = 19801;
const READY_TIMEOUT_MS = 300_000; // 5 min — Docker builds with apt packages
const SESSION_START_TIMEOUT_MS = 120_000; // 2 min — agent container start

const CLAWMASONS_HOME = path.join(E2E_ROOT, "tmp", "clawmasons");
const LODGE = "e2e";
const LODGE_HOME = path.join(CLAWMASONS_HOME, LODGE);
const CHAPTER_DIR = path.join(LODGE_HOME, "chapters", "initiate");

// ── Helpers ──────────────────────────────────────────────────────────

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
        cleanup();
        origResolve(combined);
      }
    };

    const onStdout = () => check();
    const onStderr = () => check();
    const onExit = (code: number | null) => {
      clearTimeout(timer);
      cleanup();
      origReject(
        new Error(
          `Process exited with code ${code} while waiting for "${target}".\n` +
            `stdout:\n${accumulated.stdout}\n` +
            `stderr:\n${accumulated.stderr}`,
        ),
      );
    };

    const cleanup = () => {
      proc.stdout?.removeListener("data", onStdout);
      proc.stderr?.removeListener("data", onStderr);
      proc.removeListener("exit", onExit);
    };

    const origResolve = resolve;
    const origReject = reject;

    proc.stdout?.on("data", onStdout);
    proc.stderr?.on("data", onStderr);
    proc.on("exit", onExit);

    // Check what's already accumulated
    check();
  });
}

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

function assertDefined<T>(value: T | null | undefined, msg: string): T {
  if (value == null) throw new Error(msg);
  return value;
}

// ── Test Suite ────────────────────────────────────────────────────────

describe("ACP initiate bootstrap e2e", () => {
  let sessionCwd: string;
  let acpProcess: ChildProcess | null = null;
  const processOutput = { stdout: "", stderr: "" };

  beforeAll(() => {
    // Clean up Docker containers from a previous (possibly crashed) run
    // before deleting the filesystem state they reference.
    if (fs.existsSync(CHAPTER_DIR)) {
      const sessionsDir = path.join(CHAPTER_DIR, ".clawmasons", "sessions");
      if (fs.existsSync(sessionsDir)) {
        for (const sessionId of fs.readdirSync(sessionsDir)) {
          const composeFile = path.join(sessionsDir, sessionId, "docker", "docker-compose.yml");
          if (fs.existsSync(composeFile)) {
            try {
              execSync(
                `docker compose -f "${composeFile}" --profile agent down --rmi local --volumes --remove-orphans`,
                { stdio: "pipe", timeout: 30_000 },
              );
            } catch { /* best-effort */ }
          }
        }
      }
    }

    // Clean up previous run (fresh bootstrap each time)
    if (fs.existsSync(CLAWMASONS_HOME)) {
      fs.rmSync(CLAWMASONS_HOME, { recursive: true, force: true });
    }

    // Create a temp directory for the session CWD
    sessionCwd = fs.mkdtempSync(path.join(os.tmpdir(), "acp-e2e-session-"));
  }, 60_000);

  afterAll(async () => {
    // Kill the ACP process if still running
    if (acpProcess && !acpProcess.killed) {
      acpProcess.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 3_000));
      if (!acpProcess.killed) {
        acpProcess.kill("SIGKILL");
      }
    }

    // Best-effort Docker cleanup — find all docker-compose files in sessions
    try {
      const sessionsDir = path.join(CHAPTER_DIR, ".clawmasons", "sessions");
      if (fs.existsSync(sessionsDir)) {
        for (const sessionId of fs.readdirSync(sessionsDir)) {
          const composeFile = path.join(sessionsDir, sessionId, "docker", "docker-compose.yml");
          if (fs.existsSync(composeFile)) {
            try {
              execSync(`docker compose -f "${composeFile}" --profile agent down --rmi local --volumes`, {
                stdio: "pipe",
                timeout: 30_000,
              });
            } catch { /* best-effort */ }
          }
        }
      }
    } catch { /* best-effort */ }

    // Leave CLAWMASONS_HOME for debugging — only clean up session CWD
    if (sessionCwd && fs.existsSync(sessionCwd)) {
      fs.rmSync(sessionCwd, { recursive: true, force: true });
    }
  }, 120_000);

  // ── Test 1: Bootstrap and Ready ────────────────────────────────────

  it("bootstraps initiate chapter and bridge becomes ready", async () => {
    acpProcess = spawn(
      "node",
      [
        CLAWMASONS_BIN,
        "acp",
        "--chapter", "initiate",
        "--role", "chapter-creator",
        "--init-agent", "@e2e.initiate/agent-mcp",
        "--port", String(ACP_BRIDGE_PORT),
        "--proxy-port", String(ACP_PROXY_PORT),
      ],
      {
        cwd: E2E_ROOT,
        env: {
          ...process.env,
          CLAWMASONS_HOME,
          LODGE,
          TEST_TOKEN: "test-token-e2e",
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

    // Wait for the "Ready" log — means bootstrap + infra start succeeded
    await waitForOutput(acpProcess, "Ready", READY_TIMEOUT_MS, processOutput);

    // Verify directory structure created by bootstrap
    // Lodge
    expect(fs.existsSync(path.join(CLAWMASONS_HOME, "config.json"))).toBe(true);
    expect(fs.existsSync(LODGE_HOME)).toBe(true);

    // Chapter workspace
    expect(fs.existsSync(path.join(CHAPTER_DIR, ".clawmasons"))).toBe(true);
    expect(fs.existsSync(path.join(CHAPTER_DIR, "package.json"))).toBe(true);
    expect(fs.existsSync(path.join(CHAPTER_DIR, "agents", "mcp", "package.json"))).toBe(true);
    expect(fs.existsSync(path.join(CHAPTER_DIR, "agents", "pi", "package.json"))).toBe(true);
    expect(fs.existsSync(path.join(CHAPTER_DIR, "roles", "chapter-creator", "package.json"))).toBe(true);
    expect(fs.existsSync(path.join(CHAPTER_DIR, "apps", "filesystem", "package.json"))).toBe(true);

    // Docker build artifacts
    const dockerDir = path.join(CHAPTER_DIR, "docker");
    expect(fs.existsSync(dockerDir)).toBe(true);
    expect(fs.existsSync(path.join(dockerDir, "proxy", "chapter-creator", "Dockerfile"))).toBe(true);
    expect(fs.existsSync(path.join(dockerDir, "credential-service", "Dockerfile"))).toBe(true);

    // Verify bridge health endpoint
    await pollHealthEndpoint(`http://localhost:${ACP_BRIDGE_PORT}/health`, 10_000);
  }, READY_TIMEOUT_MS + 15_000);

  // ── Test 2: Session Lifecycle ──────────────────────────────────────

  it("session/new triggers agent container start", async () => {
    const proc = assertDefined(acpProcess, "acpProcess must be running");
    expect(proc.killed).toBe(false);

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

    if (resp.status >= 500) {
      const body = await resp.text();
      console.error(`session/new returned ${resp.status}: ${body}`);
      console.error(`Process stdout so far:\n${processOutput.stdout}`);
      console.error(`Process stderr so far:\n${processOutput.stderr}`);
    }
    expect(resp.status).toBeLessThan(500);

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

    // The mcp-agent connects to proxy in background with retries.
    // Poll until tools become available.
    const start = Date.now();
    const timeout = 60_000;
    let output = "";

    while (Date.now() - start < timeout) {
      const resp = await fetch(`http://localhost:${ACP_BRIDGE_PORT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "list" }),
      });

      expect(resp.ok).toBe(true);
      const result = await resp.json() as { output: string; exit: boolean };
      expect(result).toHaveProperty("output");
      expect(result.exit).toBe(false);

      output = result.output;
      if (output.includes("Available tools:")) break;

      await new Promise((r) => setTimeout(r, 2_000));
    }

    // Should show filesystem tools from the chapter-creator role
    expect(output).toContain("Available tools:");
    expect(output).toMatch(/list_directory|read_file|write_file/);
  }, 90_000);

  // ── Test 4: Graceful Shutdown ──────────────────────────────────────

  it("process shuts down gracefully on SIGTERM", async () => {
    const proc = assertDefined(acpProcess, "acpProcess must be running");
    expect(proc.killed).toBe(false);

    proc.kill("SIGTERM");

    const exitCode = await new Promise<number | null>((resolve) => {
      const timer = setTimeout(() => {
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

    expect(exitCode).toBe(0);

    // Verify the bridge is no longer listening
    try {
      await fetch(`http://localhost:${ACP_BRIDGE_PORT}/health`);
      expect.fail("Bridge should no longer be listening after shutdown");
    } catch {
      // Expected: connection refused
    }
  }, 30_000);
});
