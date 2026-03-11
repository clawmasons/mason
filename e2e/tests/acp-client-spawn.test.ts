/**
 * E2E Test: ACP Bootstrap via `clawmasons acp --chapter initiate`
 *
 * Tests the full bootstrap flow that an ACP client triggers using the
 * SDK's ClientSideConnection over stdio ndjson — the same protocol path
 * that a real editor would use.
 *
 *   1. Spawn `clawmasons acp --chapter initiate --role chapter-creator`
 *   2. Verify lodge, chapter, and Docker artifacts are created
 *   3. Verify the ACP handshake via ClientSideConnection.initialize()
 *   4. Send session/new with cwd — triggers agent container start
 *   5. Verify the agent responds to prompt requests
 *   6. Graceful shutdown
 *
 * Uses the mcp-agent runtime (no LLM token required).
 *
 * Environment:
 *   CLAWMASONS_HOME = e2e/tmp/clawmasons
 *   LODGE = "e2e"
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
import { CLAWMASONS_BIN, E2E_ROOT } from "./helpers.js";

// ── Constants ────────────────────────────────────────────────────────

const READY_TIMEOUT_MS = 300_000; // 5 min — Docker builds with apt packages
const SESSION_START_TIMEOUT_MS = 120_000; // 2 min — agent container start

const CLAWMASONS_HOME = path.join(E2E_ROOT, "tmp", "clawmasons");
const LODGE = "e2e";
const LODGE_HOME = path.join(CLAWMASONS_HOME, LODGE);
const CHAPTER_DIR = path.join(LODGE_HOME, "chapters", "initiate");

// ── Helpers ──────────────────────────────────────────────────────────

function assertDefined<T>(value: T | null | undefined, msg: string): T {
  if (value == null) throw new Error(msg);
  return value;
}

/**
 * Create a minimal Client implementation for the ClientSideConnection.
 * The E2E test acts as a client — the bridge may call back for
 * requestPermission, sessionUpdate, etc. We provide no-op / minimal
 * handlers since the test doesn't exercise those paths.
 */
function createTestClient(_agent: Agent): Client {
  return {
    requestPermission: async () => ({
      outcome: { outcome: "selected" as const, optionId: "allow" },
    }),
    sessionUpdate: async () => {
      // no-op — we don't inspect session updates in the E2E test
    },
  };
}

// ── Test Suite ────────────────────────────────────────────────────────

describe("ACP initiate bootstrap e2e", () => {
  let sessionCwd: string;
  let acpProcess: ChildProcess | null = null;
  let connection: ClientSideConnection | null = null;
  const stderrOutput: string[] = [];

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

  // ── Test 1: Bootstrap and ACP Handshake ────────────────────────────

  it("bootstraps initiate chapter and initialize returns valid response", async () => {
    // Spawn the ACP process — no --transport http, no --port (stdio only)
    acpProcess = spawn(
      "node",
      [
        CLAWMASONS_BIN,
        "acp",
        "--chapter", "initiate",
        "--role", "chapter-creator",
        "--init-agent", "@e2e.initiate/agent-mcp",
      ],
      {
        cwd: E2E_ROOT,
        env: {
          ...process.env,
          CLAWMASONS_HOME,
          LODGE,
          TEST_TOKEN: "test-token-e2e",
          TEST_LLM_TOKEN: "test-llm-token-e2e",
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    // Accumulate stderr for debugging
    acpProcess.stderr?.on("data", (chunk: Buffer) => {
      stderrOutput.push(chunk.toString());
    });

    // Create ClientSideConnection over the spawned process's stdin/stdout
    const childStdin = assertDefined(acpProcess.stdin, "child.stdin must be available");
    const childStdout = assertDefined(acpProcess.stdout, "child.stdout must be available");

    const output = Writable.toWeb(childStdin) as WritableStream<Uint8Array>;
    const input = Readable.toWeb(childStdout) as ReadableStream<Uint8Array>;
    const stream = ndJsonStream(output, input);

    connection = new ClientSideConnection(createTestClient, stream);

    // Send initialize — the bridge handles this locally without a container.
    // This also serves as the readiness signal (replaces HTTP health polling).
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

    // Verify .clawmasons directory was created in the session CWD
    expect(fs.existsSync(path.join(sessionCwd, ".clawmasons"))).toBe(true);
  }, SESSION_START_TIMEOUT_MS + 15_000);

  // ── Test 3: Tool Listing via Prompt ────────────────────────────────

  it("agent responds to prompt with tool information", async () => {
    const conn = assertDefined(connection, "connection must be established");
    expect(acpProcess).not.toBeNull();

    // The mcp-agent connects to proxy in background with retries.
    // Poll via prompt until tools become available.
    const start = Date.now();
    const timeout = 60_000;
    let promptResponse: PromptResponse | undefined;

    while (Date.now() - start < timeout) {
      try {
        const resp = await conn.prompt({
          sessionId: "test-session",
          messages: [
            {
              role: "user",
              content: { type: "text", text: "list" },
            },
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
    // credential (TEST_TOKEN, TEST_LLM_TOKEN) during bootstrap.
    //
    // Since the agent runs via `docker compose run`, its logs aren't
    // accessible via `docker compose logs`. Use `docker logs` with
    // the container name pattern instead.
    const containerId = execSync(
      `docker ps -q --filter "name=agent-mcp-chapter-creator" 2>/dev/null`,
      { timeout: 5_000 },
    ).toString().trim();

    expect(containerId).not.toBe("");

    const logs = execSync(
      `docker logs ${containerId} 2>&1`,
      { timeout: 10_000 },
    ).toString();

    expect(logs).toContain("Requesting 2 credential(s)");
    expect(logs).toContain("All credentials received");
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

    expect(exitCode).toBe(0);

    // Verify the connection is closed (stdio streams ended)
    if (connection) {
      // connection.closed should resolve since the process exited
      await Promise.race([
        connection.closed,
        new Promise((r) => setTimeout(r, 5_000)),
      ]);
    }
  }, 30_000);
});
