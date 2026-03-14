/**
 * E2E Test: ACP session lifecycle via `mason run --agent-type mcp --acp --role mcp-test`
 *
 * Tests the full ACP flow using the SDK's ClientSideConnection over stdio
 * ndjson — the same protocol path that a real editor would use.
 *
 *   1. Copy fixture workspace with mcp-test role
 *   2. Spawn `mason run --agent-type mcp --acp --role mcp-test` (project-local)
 *   3. Verify ACP handshake via ClientSideConnection.initialize()
 *   4. Send session/new with cwd — triggers agent container start
 *   5. Verify agent responds to prompt
 *   6. Graceful shutdown
 *
 * Uses the mcp-agent runtime (no LLM token required).
 *
 * PRD refs: REQ-SDK-007
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Readable, Writable } from "node:stream";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import {
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type Agent,
  type Client,
  type InitializeResponse,
  type NewSessionResponse,
  type PromptResponse,
} from "@agentclientprotocol/sdk";
import { MASON_BIN, copyFixtureWorkspace } from "./helpers.js";

// ── Constants ────────────────────────────────────────────────────────

const READY_TIMEOUT_MS = 120_000; // 2 min — Docker builds
const SESSION_START_TIMEOUT_MS = 60_000; // 1 min — agent container start

// ── Helpers ──────────────────────────────────────────────────────────

function assertDefined<T>(value: T | null | undefined, msg: string): T {
  if (value == null) throw new Error(msg);
  return value;
}

/**
 * Create a minimal Client implementation for the ClientSideConnection.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function createTestClient(_agent: Agent): Client {
  return {
    requestPermission: async () => ({
      outcome: { outcome: "selected" as const, optionId: "allow" },
    }),
    sessionUpdate: async () => {
      // no-op
    },
  };
}

// ── Test Suite ────────────────────────────────────────────────────────

describe("ACP project-local e2e", () => {
  let workspaceDir: string;
  let sessionCwd: string;
  let acpProcess: ChildProcess | null = null;
  let connection: ClientSideConnection | null = null;
  const stderrOutput: string[] = [];

  beforeAll(() => {
    // Copy fixture workspace with mcp-test role and agent
    workspaceDir = copyFixtureWorkspace("acp-spawn", {
      excludePaths: ["agents/note-taker"],
    });

    // Clean up Docker containers from previous runs
    const sessionsDir = path.join(workspaceDir, ".mason", "sessions");
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

    // Clean up workspace
    if (workspaceDir && fs.existsSync(workspaceDir)) {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
    if (sessionCwd && fs.existsSync(sessionCwd)) {
      fs.rmSync(sessionCwd, { recursive: true, force: true });
    }
  }, 120_000);

  // ── Test 1: ACP Handshake ────────────────────────────────────────────

  it("starts ACP server and initialize returns valid response", async () => {
    // Spawn the ACP process — project-local, no CLAWMASONS_HOME
    acpProcess = spawn(
      "node",
      [
        MASON_BIN,
        "run",
        "--agent-type", "mcp",
        "--acp",
        "--role", "mcp-test",
      ],
      {
        cwd: workspaceDir,
        env: {
          ...process.env,
          TEST_TOKEN: "test-token-e2e",
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    // Accumulate stderr for debugging
    acpProcess.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderrOutput.push(text);
      console.error("[ACP stderr]", text.trimEnd());
    });

    acpProcess.on("exit", (code, signal) => {
      console.error(`[ACP process] exited code=${code} signal=${signal}`);
    });

    // Create ClientSideConnection over the spawned process's stdin/stdout
    const childStdin = assertDefined(acpProcess.stdin, "child.stdin must be available");
    const childStdout = assertDefined(acpProcess.stdout, "child.stdout must be available");

    const output = Writable.toWeb(childStdin) as WritableStream<Uint8Array>;
    const input = Readable.toWeb(childStdout) as ReadableStream<Uint8Array>;
    const stream = ndJsonStream(output, input);

    connection = new ClientSideConnection(createTestClient, stream);

    // Send initialize — the bridge handles this locally without a container.
    const initResponse: InitializeResponse = await connection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: "acp-e2e-test",
        version: "0.1.0",
      },
    });

    // Verify ACP handshake response
    expect(initResponse).toHaveProperty("protocolVersion");
    expect(initResponse).toHaveProperty("agentInfo");
    expect(initResponse.agentInfo).toBeTruthy();

    // Verify docker artifacts were auto-built in project-local path
    const dockerDir = path.join(workspaceDir, ".mason", "docker");
    expect(fs.existsSync(dockerDir)).toBe(true);

    // Verify .mason/.gitignore was created
    const gitignorePath = path.join(workspaceDir, ".mason", ".gitignore");
    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
      expect(gitignoreContent).toContain("docker/");
    }
  }, READY_TIMEOUT_MS + 15_000);

  // ── Test 2: Session Lifecycle ──────────────────────────────────────

  it("session/new triggers agent container start", async () => {
    const conn = assertDefined(connection, "connection must be established");
    const proc = assertDefined(acpProcess, "acpProcess must be running");
    expect(proc.killed).toBe(false);

    // Send session/new with cwd — triggers container start
    const sessionResponse: NewSessionResponse = await conn.newSession({
      cwd: sessionCwd,
      mcpServers: [],
    });

    // Verify session was created
    expect(sessionResponse).toHaveProperty("sessionId");
    expect(typeof sessionResponse.sessionId).toBe("string");
    expect(sessionResponse.sessionId.length).toBeGreaterThan(0);

    // Verify .mason directory was created in the session CWD
    expect(fs.existsSync(path.join(sessionCwd, ".mason"))).toBe(true);
  }, SESSION_START_TIMEOUT_MS + 15_000);

  // ── Test 3: Tool Listing via Prompt ────────────────────────────────

  it("agent responds to prompt with tool information", async () => {
    const conn = assertDefined(connection, "connection must be established");
    expect(acpProcess).not.toBeNull();

    // Poll via prompt until the agent responds
    const start = Date.now();
    const timeout = 60_000;
    let promptResponse: PromptResponse | undefined;

    while (Date.now() - start < timeout) {
      try {
        const resp = await conn.prompt({
          sessionId: "test-session",
          prompt: [
            { type: "text", text: "list" },
          ],
        });

        promptResponse = resp;

        // If we got a response with a stop reason, break
        if (resp.stopReason) break;
      } catch {
        // Agent might not be ready yet — retry
      }

      await new Promise((r) => setTimeout(r, 2_000));
    }

    expect(promptResponse).toBeDefined();
    expect(promptResponse!.stopReason).toBeTruthy();
  }, 90_000);

  // ── Test 4: Credential Resolution ────────────────────────────────────

  it("agent-entry resolves declared credentials via credential service", async () => {
    // The mcp-agent calls credential_request MCP tool for each declared
    // credential (TEST_TOKEN) during bootstrap.
    //
    // Use `docker ps` to find the agent container (new naming: agent-{role})
    const containerId = execSync(
      `docker ps -q --filter "name=agent-mcp-test" 2>/dev/null`,
      { timeout: 5_000 },
    ).toString().trim();

    expect(containerId).not.toBe("");

    const logs = execSync(
      `docker logs ${containerId} 2>&1`,
      { timeout: 10_000 },
    ).toString();

    expect(logs).toContain("credential");
  }, 15_000);

  // ── Test 5: Graceful Shutdown ──────────────────────────────────────

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

    // Process should exit (not hang). Exit code 0 or 1 are acceptable.
    expect(exitCode).not.toBeNull();

    // Verify the connection is closed (stdio streams ended)
    if (connection) {
      await Promise.race([
        connection.closed,
        new Promise((r) => setTimeout(r, 5_000)),
      ]);
    }
  }, 30_000);
});
