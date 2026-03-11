/**
 * E2E Test: MCP Note Taker Agent — Full Pipeline
 *
 * Exercises the full agent pipeline without requiring an LLM token:
 *   1. Copy fixture workspace to temp dir
 *   2. Run `chapter build` (resolve + pack + docker-init)
 *   3. Suite A: Start proxy, connect MCP client, call all filesystem tools
 *   4. Suite B: Start agent in ACP mode, exercise tools via acpx
 *
 * Uses the mcp-note-taker fixture which depends on @clawmasons/mcp-agent
 * (a lightweight tool-calling agent that requires no LLM).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { execSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  copyFixtureWorkspace,
  chapterExec,
  waitForHealth,
} from "./helpers.js";

// ── Shared Setup ──────────────────────────────────────────────────────

describe("mcp-agent note-taker e2e", () => {
  let workspaceDir: string;
  let dockerDir: string;
  let notesDir: string;

  beforeAll(async () => {
    // Copy fixtures excluding mcp-test (wildcard permissions break docker-init)
    workspaceDir = copyFixtureWorkspace("mcp-note-taker", {
      excludePaths: ["agents/mcp-test", "roles/mcp-test"],
    });

    // Build: resolve + pack + docker-init
    chapterExec(["chapter", "build"], workspaceDir, { timeout: 120_000 });

    dockerDir = path.join(workspaceDir, "docker");

    // Create notes directory required by the filesystem MCP server
    notesDir = path.join(workspaceDir, "notes");
    fs.mkdirSync(notesDir, { recursive: true });
  }, 120_000);

  afterAll(() => {
    if (workspaceDir && fs.existsSync(workspaceDir)) {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  // ── Build Output Verification ─────────────────────────────────────

  describe("build output", () => {
    it("generates agent Dockerfile for mcp-note-taker/writer", () => {
      expect(
        fs.existsSync(
          path.join(dockerDir, "agent", "mcp-note-taker", "writer", "Dockerfile"),
        ),
      ).toBe(true);
    });

    it("agent Dockerfile uses mcp-agent entrypoint", () => {
      const dockerfile = fs.readFileSync(
        path.join(dockerDir, "agent", "mcp-note-taker", "writer", "Dockerfile"),
        "utf-8",
      );
      expect(dockerfile).toContain("mcp-agent");
    });

    it("generates workspace with .mcp.json", () => {
      const wsDir = path.join(
        dockerDir, "agent", "mcp-note-taker", "writer", "workspace",
      );
      expect(fs.existsSync(wsDir)).toBe(true);
      expect(fs.existsSync(path.join(wsDir, ".mcp.json"))).toBe(true);
    });

    it("generates proxy Dockerfile for writer role", () => {
      expect(
        fs.existsSync(path.join(dockerDir, "proxy", "writer", "Dockerfile")),
      ).toBe(true);
    });
  });

  // ── Suite A: Proxy Tool Pipeline (run-agent equivalent) ───────────

  describe("proxy tool pipeline", () => {
    const PROXY_PORT = 19600;
    const PROXY_TOKEN = crypto.randomBytes(32).toString("hex");
    const CRED_TOKEN = crypto.randomBytes(32).toString("hex");
    const COMPOSE_PROJECT = `chapter-mcp-e2e-proxy-${Date.now()}`;
    let composeFile: string;

    beforeAll(() => {
      const composeContent = `# Generated for mcp-note-taker proxy e2e test
services:
  proxy-writer:
    build:
      context: "${dockerDir}"
      dockerfile: "proxy/writer/Dockerfile"
    ports:
      - "${PROXY_PORT}:9090"
    volumes:
      - "${workspaceDir}:/workspace"
      - "${notesDir}:/app/notes"
    environment:
      - CHAPTER_PROXY_TOKEN=${PROXY_TOKEN}
      - CREDENTIAL_PROXY_TOKEN=${CRED_TOKEN}
    command: ["chapter", "proxy", "--agent", "@test/agent-mcp-note-taker", "--transport", "streamable-http"]
    restart: "no"

  credential-service:
    build:
      context: "${dockerDir}"
      dockerfile: "credential-service/Dockerfile"
    environment:
      - CREDENTIAL_PROXY_TOKEN=${CRED_TOKEN}
    depends_on:
      - proxy-writer
    restart: "no"

  agent-mcp-note-taker-writer:
    build:
      context: "${dockerDir}"
      dockerfile: "agent/mcp-note-taker/writer/Dockerfile"
    volumes:
      - "${workspaceDir}:/workspace"
    depends_on:
      - credential-service
    environment:
      - MCP_PROXY_TOKEN=${PROXY_TOKEN}
      - MCP_PROXY_URL=http://proxy-writer:9090
      - TEST_TOKEN=e2e-test-token
    stdin_open: true
    tty: true
    init: true
    restart: "no"
`;
      const composeDir = path.join(workspaceDir, "e2e-compose-proxy");
      fs.mkdirSync(composeDir, { recursive: true });
      composeFile = path.join(composeDir, "docker-compose.yml");
      fs.writeFileSync(composeFile, composeContent);
    });

    afterAll(() => {
      try {
        execSync(
          `docker compose -p ${COMPOSE_PROJECT} -f "${composeFile}" down --rmi local --volumes`,
          { stdio: "pipe", timeout: 60_000 },
        );
      } catch { /* best-effort cleanup */ }
    });

    it("builds Docker images", () => {
      execSync(
        `docker compose -p ${COMPOSE_PROJECT} -f "${composeFile}" build`,
        { cwd: dockerDir, stdio: "pipe", timeout: 180_000 },
      );
    }, 190_000);

    it("starts proxy and credential service", () => {
      execSync(
        `docker compose -p ${COMPOSE_PROJECT} -f "${composeFile}" up -d proxy-writer credential-service`,
        { stdio: "pipe", timeout: 60_000 },
      );

      const ps = execSync(
        `docker compose -p ${COMPOSE_PROJECT} -f "${composeFile}" ps --format json`,
        { stdio: "pipe", timeout: 10_000 },
      ).toString();
      expect(ps).toContain("proxy-writer");
    }, 65_000);

    it("proxy health endpoint responds", async () => {
      await waitForHealth(`http://localhost:${PROXY_PORT}/health`, 30_000, {
        composeProject: COMPOSE_PROJECT,
        composeFile,
        service: "proxy-writer",
      });
    }, 35_000);

    it("MCP client lists governed filesystem tools", async () => {
      const client = new Client({ name: "mcp-e2e-test", version: "0.1.0" });
      const transport = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${PROXY_PORT}/mcp`),
        {
          requestInit: {
            headers: { Authorization: `Bearer ${PROXY_TOKEN}` },
          },
        },
      );
      await client.connect(transport);

      const result = await client.listTools();
      expect(result).toHaveProperty("tools");
      expect(Array.isArray(result.tools)).toBe(true);

      // Verify filesystem tools are present (prefixed with app name)
      const toolNames = result.tools.map((t) => t.name);
      expect(toolNames.some((n) => n.includes("read_file"))).toBe(true);
      expect(toolNames.some((n) => n.includes("write_file"))).toBe(true);
      expect(toolNames.some((n) => n.includes("list_directory"))).toBe(true);
      expect(toolNames.some((n) => n.includes("create_directory"))).toBe(true);

      await client.close();
    }, 30_000);

    it("calls list_directory through governed proxy", async () => {
      const client = new Client({ name: "mcp-e2e-listdir", version: "0.1.0" });
      const transport = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${PROXY_PORT}/mcp`),
        {
          requestInit: {
            headers: { Authorization: `Bearer ${PROXY_TOKEN}` },
          },
        },
      );
      await client.connect(transport);

      const toolsResult = await client.listTools();
      const listDirTool = toolsResult.tools.find(
        (t) => t.name.includes("list_directory") && !t.name.includes("list_allowed"),
      );
      expect(listDirTool).toBeDefined();

      if (listDirTool) {
        const callResult = await client.callTool({
          name: listDirTool.name,
          arguments: { path: "/workspace" },
        });
        expect(callResult).toHaveProperty("content");
      }

      await client.close();
    }, 30_000);

    it("calls write_file then read_file through governed proxy", async () => {
      const client = new Client({ name: "mcp-e2e-readwrite", version: "0.1.0" });
      const transport = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${PROXY_PORT}/mcp`),
        {
          requestInit: {
            headers: { Authorization: `Bearer ${PROXY_TOKEN}` },
          },
        },
      );
      await client.connect(transport);

      const toolsResult = await client.listTools();

      // Write a test note
      const writeTool = toolsResult.tools.find((t) => t.name.includes("write_file"));
      expect(writeTool).toBeDefined();

      if (writeTool) {
        const writeResult = await client.callTool({
          name: writeTool.name,
          arguments: {
            path: "/app/notes/e2e-test-note.md",
            content: "# E2E Test Note\n\nWritten by mcp-note-taker e2e test.",
          },
        });
        expect(writeResult).toHaveProperty("content");
      }

      // Read it back
      const readTool = toolsResult.tools.find((t) => t.name.includes("read_file"));
      expect(readTool).toBeDefined();

      if (readTool) {
        const readResult = await client.callTool({
          name: readTool.name,
          arguments: { path: "/app/notes/e2e-test-note.md" },
        });
        expect(readResult).toHaveProperty("content");
        const textContent = JSON.stringify(readResult.content);
        expect(textContent).toContain("E2E Test Note");
      }

      await client.close();
    }, 30_000);

    it("calls create_directory through governed proxy", async () => {
      const client = new Client({ name: "mcp-e2e-mkdir", version: "0.1.0" });
      const transport = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${PROXY_PORT}/mcp`),
        {
          requestInit: {
            headers: { Authorization: `Bearer ${PROXY_TOKEN}` },
          },
        },
      );
      await client.connect(transport);

      const toolsResult = await client.listTools();
      const mkdirTool = toolsResult.tools.find((t) => t.name.includes("create_directory"));
      expect(mkdirTool).toBeDefined();

      if (mkdirTool) {
        const callResult = await client.callTool({
          name: mkdirTool.name,
          arguments: { path: "/app/notes/e2e-subdir" },
        });
        expect(callResult).toHaveProperty("content");
      }

      await client.close();
    }, 30_000);

    it("starts agent container successfully", async () => {
      // Start agent in background (REPL mode waits for stdin)
      execSync(
        `docker compose -p ${COMPOSE_PROJECT} -f "${composeFile}" up -d agent-mcp-note-taker-writer`,
        { stdio: "pipe", timeout: 60_000 },
      );

      // Wait briefly for container to start
      await new Promise((r) => setTimeout(r, 3000));

      // Check logs to verify mcp-agent started
      const logs = execSync(
        `docker compose -p ${COMPOSE_PROJECT} -f "${composeFile}" logs agent-mcp-note-taker-writer 2>&1`,
        { stdio: "pipe", timeout: 10_000 },
      ).toString();

      expect(logs).not.toContain("exec mcp-agent failed");
      expect(logs).toContain("mcp-agent");
    }, 65_000);
  });

  // ── Suite B: ACP Agent Mode ──────────────────────────────────────
  // Removed: The mcp-agent no longer runs an HTTP server on port 3002.
  // ACP is now tested via ClientSideConnection in acp-client-spawn.test.ts.

  describe.skip("ACP agent mode (obsolete — replaced by acp-client-spawn.test.ts)", () => {
    const ACP_PROXY_PORT = 19700;
    const ACP_AGENT_PORT = 19702;
    const ACP_PROXY_TOKEN = crypto.randomBytes(32).toString("hex");
    const ACP_CRED_TOKEN = crypto.randomBytes(32).toString("hex");
    const ACP_COMPOSE_PROJECT = `chapter-mcp-e2e-acp-${Date.now()}`;
    let acpComposeFile: string;

    beforeAll(() => {
      const composeContent = `# Generated for mcp-note-taker ACP e2e test
services:
  proxy-writer:
    build:
      context: "${dockerDir}"
      dockerfile: "proxy/writer/Dockerfile"
    ports:
      - "${ACP_PROXY_PORT}:9090"
    volumes:
      - "${workspaceDir}:/workspace"
      - "${notesDir}:/app/notes"
    environment:
      - CHAPTER_PROXY_TOKEN=${ACP_PROXY_TOKEN}
      - CREDENTIAL_PROXY_TOKEN=${ACP_CRED_TOKEN}
      - CHAPTER_SESSION_TYPE=acp
    command: ["chapter", "proxy", "--agent", "@test/agent-mcp-note-taker", "--transport", "streamable-http"]
    restart: "no"

  credential-service:
    build:
      context: "${dockerDir}"
      dockerfile: "credential-service/Dockerfile"
    environment:
      - CREDENTIAL_PROXY_TOKEN=${ACP_CRED_TOKEN}
    depends_on:
      - proxy-writer
    restart: "no"

  agent-mcp-note-taker-writer:
    build:
      context: "${dockerDir}"
      dockerfile: "agent/mcp-note-taker/writer/Dockerfile"
    volumes:
      - "${workspaceDir}:/workspace"
    depends_on:
      - credential-service
    environment:
      - MCP_PROXY_TOKEN=${ACP_PROXY_TOKEN}
      - MCP_PROXY_URL=http://proxy-writer:9090
      - TEST_TOKEN=e2e-test-token
    ports:
      - "${ACP_AGENT_PORT}:3002"
    command: ["--acp"]
    init: true
    restart: "no"
`;
      const composeDir = path.join(workspaceDir, "e2e-compose-acp");
      fs.mkdirSync(composeDir, { recursive: true });
      acpComposeFile = path.join(composeDir, "docker-compose.yml");
      fs.writeFileSync(acpComposeFile, composeContent);
    });

    afterAll(() => {
      try {
        execSync(
          `docker compose -p ${ACP_COMPOSE_PROJECT} -f "${acpComposeFile}" down --rmi local --volumes`,
          { stdio: "pipe", timeout: 60_000 },
        );
      } catch { /* best-effort cleanup */ }
    });

    it("builds ACP Docker images", () => {
      execSync(
        `docker compose -p ${ACP_COMPOSE_PROJECT} -f "${acpComposeFile}" build`,
        { cwd: dockerDir, stdio: "pipe", timeout: 180_000 },
      );
    }, 190_000);

    it("starts all ACP services", async () => {
      execSync(
        `docker compose -p ${ACP_COMPOSE_PROJECT} -f "${acpComposeFile}" up -d`,
        { stdio: "pipe", timeout: 60_000 },
      );

      // Wait for agent to start up (may need to connect to proxy first)
      await new Promise((r) => setTimeout(r, 5000));

      const ps = execSync(
        `docker compose -p ${ACP_COMPOSE_PROJECT} -f "${acpComposeFile}" ps -a --format json`,
        { stdio: "pipe", timeout: 10_000 },
      ).toString();
      expect(ps).toContain("proxy-writer");

      // Check agent container status
      const agentLogs = execSync(
        `docker compose -p ${ACP_COMPOSE_PROJECT} -f "${acpComposeFile}" logs agent-mcp-note-taker-writer 2>&1`,
        { stdio: "pipe", timeout: 10_000 },
      ).toString();

      // If agent failed to start, show diagnostics
      if (!agentLogs.includes("mcp-agent")) {
        // Get full ps output for debugging
        const psAll = execSync(
          `docker compose -p ${ACP_COMPOSE_PROJECT} -f "${acpComposeFile}" ps -a 2>&1`,
          { stdio: "pipe", timeout: 10_000 },
        ).toString();
        throw new Error(`Agent did not start. ps:\n${psAll}\n\nlogs:\n${agentLogs}`);
      }
    }, 65_000);

    it("agent ACP health endpoint responds", async () => {
      // The mcp-agent ACP server responds to GET / with status JSON
      await waitForHealth(`http://localhost:${ACP_AGENT_PORT}`, 30_000, {
        composeProject: ACP_COMPOSE_PROJECT,
        composeFile: acpComposeFile,
        service: "agent-mcp-note-taker-writer",
      });
    }, 35_000);

    it("agent MCP session is established", async () => {
      // The ACP server starts immediately but the MCP proxy connection
      // happens in the background. Poll until tools are available.
      const maxWait = 45_000;
      const start = Date.now();
      let toolsAvailable = false;

      while (Date.now() - start < maxWait) {
        try {
          const resp = await fetch(`http://localhost:${ACP_AGENT_PORT}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command: "list" }),
          });
          const result = await resp.json() as { output: string };
          if (result.output.includes("Available tools:")) {
            toolsAvailable = true;
            break;
          }
        } catch { /* retry */ }
        await new Promise((r) => setTimeout(r, 2000));
      }

      if (!toolsAvailable) {
        const logs = execSync(
          `docker compose -p ${ACP_COMPOSE_PROJECT} -f "${acpComposeFile}" logs agent-mcp-note-taker-writer 2>&1`,
          { stdio: "pipe", timeout: 10_000 },
        ).toString();
        throw new Error(`MCP session not established within ${maxWait}ms.\nAgent logs:\n${logs}`);
      }
    }, 50_000);

    it("proxy health endpoint responds", async () => {
      await waitForHealth(`http://localhost:${ACP_PROXY_PORT}/health`, 30_000, {
        composeProject: ACP_COMPOSE_PROJECT,
        composeFile: acpComposeFile,
        service: "proxy-writer",
      });
    }, 35_000);

    it("ACP agent lists tools via HTTP POST", async () => {
      const resp = await fetch(`http://localhost:${ACP_AGENT_PORT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "list" }),
      });

      expect(resp.ok).toBe(true);
      const result = await resp.json() as { output: string; exit: boolean };
      expect(result).toHaveProperty("output");
      expect(result.exit).toBe(false);
      // The list command should show available tools
      expect(result.output).toBeTruthy();
    }, 30_000);

    it("ACP agent calls list_directory via HTTP POST", async () => {
      // First list tools to get the correct prefixed name
      const listResp = await fetch(`http://localhost:${ACP_AGENT_PORT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "list" }),
      });
      const listResult = await listResp.json() as { output: string };

      // Find a list_directory tool name from the output
      const lines = listResult.output.split("\n");
      const listDirLine = lines.find((l: string) => l.includes("list_directory"));
      const toolName = listDirLine?.match(/- (\S+)/)?.[1] ?? "filesystem__list_directory";

      const resp = await fetch(`http://localhost:${ACP_AGENT_PORT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: `${toolName} {"path": "/workspace"}` }),
      });

      expect(resp.ok).toBe(true);
      const result = await resp.json() as { output: string; exit: boolean };
      expect(result).toHaveProperty("output");
      expect(result.exit).toBe(false);
    }, 30_000);

    it("ACP agent calls write_file via HTTP POST", async () => {
      // List to get tool name
      const listResp = await fetch(`http://localhost:${ACP_AGENT_PORT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "list" }),
      });
      const listResult = await listResp.json() as { output: string };
      const lines = listResult.output.split("\n");
      const writeLine = lines.find((l: string) => l.includes("write_file"));
      const toolName = writeLine?.match(/- (\S+)/)?.[1] ?? "filesystem__write_file";

      const resp = await fetch(`http://localhost:${ACP_AGENT_PORT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: `${toolName} {"path": "/app/notes/acp-test-note.md", "content": "# ACP Test\\nWritten via ACP mode."}`,
        }),
      });

      expect(resp.ok).toBe(true);
      const result = await resp.json() as { output: string; exit: boolean };
      expect(result).toHaveProperty("output");
      expect(result.exit).toBe(false);
    }, 30_000);

    it("ACP agent calls read_file via HTTP POST", async () => {
      const listResp = await fetch(`http://localhost:${ACP_AGENT_PORT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "list" }),
      });
      const listResult = await listResp.json() as { output: string };
      const lines = listResult.output.split("\n");
      const readLine = lines.find((l: string) => l.includes("read_file"));
      const toolName = readLine?.match(/- (\S+)/)?.[1] ?? "filesystem__read_file";

      const resp = await fetch(`http://localhost:${ACP_AGENT_PORT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: `${toolName} {"path": "/app/notes/acp-test-note.md"}`,
        }),
      });

      expect(resp.ok).toBe(true);
      const result = await resp.json() as { output: string; exit: boolean };
      expect(result).toHaveProperty("output");
      expect(result.output).toContain("ACP Test");
    }, 30_000);
  });
});
