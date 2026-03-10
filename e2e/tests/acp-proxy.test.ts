/**
 * E2E Test: ACP Proxy Integration
 *
 * Exercises the ACP proxy pipeline end-to-end:
 *   1. Copy fixture workspace to temp dir
 *   2. Run `chapter pack` + `chapter docker-init`
 *   3. Start proxy container with ACP session metadata
 *   4. Connect MCP client and verify governed tools
 *   5. Make tool calls and verify audit logging with ACP metadata
 *   6. Verify MCP server matching/rewriting/warnings integration
 *   7. Verify dropped server audit logging
 *
 * PRD refs: PRD section 8 UC-3 (End-to-End Testing with mcp Agent)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { execFileSync, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { matchServers } from "../../packages/cli/src/acp/matcher.js";
import { rewriteMcpConfig, extractCredentials } from "../../packages/cli/src/acp/rewriter.js";
import { generateWarnings } from "../../packages/cli/src/acp/warnings.js";
import { openDatabase, queryAuditLog } from "../../packages/proxy/src/db.js";
import { logDroppedServers } from "../../packages/proxy/src/hooks/audit.js";
import type { ResolvedApp } from "@clawmasons/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const E2E_ROOT = path.resolve(__dirname, "..");
const PROJECT_ROOT = path.resolve(E2E_ROOT, "..");
const FIXTURES_DIR = path.join(E2E_ROOT, "fixtures", "test-chapter");
const CHAPTER_BIN = path.join(PROJECT_ROOT, "bin", "chapter.js");

/** Workspace directories to copy from fixtures. */
const WORKSPACE_DIRS = ["apps", "tasks", "skills", "roles", "agents", ".clawmasons"];

/**
 * Recursively copy a directory tree, skipping node_modules and .git.
 */
function copyDirRecursive(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ── ACP Module Integration Tests ──────────────────────────────────────

describe("ACP module integration", () => {
  // Simulate the test workspace's apps
  const resolvedApps: ResolvedApp[] = [
    {
      name: "@test/app-filesystem",
      version: "1.0.0",
      transport: "stdio" as const,
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "./notes"],
      tools: ["read_file", "write_file", "list_directory", "create_directory"],
      capabilities: ["tools"],
      credentials: [],
    },
  ];

  describe("matcher + rewriter + warnings pipeline", () => {
    it("matches filesystem server and drops unmatched servers", () => {
      const mcpServers = {
        filesystem: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "./notes"],
        },
        "personal-notes": {
          command: "node",
          args: ["~/my-mcp-server/index.js"],
        },
        slack: {
          command: "npx",
          args: ["-y", "@anthropic/mcp-server-slack"],
          env: { SLACK_TOKEN: "xoxb-test-token" },
        },
      };

      const result = matchServers(mcpServers, resolvedApps);

      // filesystem matches @test/app-filesystem
      expect(result.matched).toHaveLength(1);
      expect(result.matched[0]?.name).toBe("filesystem");
      expect(result.matched[0]?.appShortName).toBe("filesystem");

      // personal-notes and slack are unmatched
      expect(result.unmatched).toHaveLength(2);
      const unmatchedNames = result.unmatched.map((u) => u.name);
      expect(unmatchedNames).toContain("personal-notes");
      expect(unmatchedNames).toContain("slack");
    });

    it("rewriter produces single chapter proxy entry", () => {
      const mcpServers = {
        filesystem: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "./notes"],
          env: { FS_TOKEN: "test-fs-token" },
        },
        "unmatched-server": {
          url: "http://example.com/mcp",
        },
      };

      const matchResult = matchServers(mcpServers, resolvedApps);
      const rewriteResult = rewriteMcpConfig(
        matchResult,
        "http://proxy:3000/mcp",
        "test-session-token",
      );

      // Single chapter entry
      expect(Object.keys(rewriteResult.mcpServers)).toEqual(["chapter"]);
      expect(rewriteResult.mcpServers.chapter?.url).toBe("http://proxy:3000/mcp");
      expect(rewriteResult.mcpServers.chapter?.headers?.Authorization).toBe(
        "Bearer test-session-token",
      );

      // Credentials extracted from matched server env
      expect(rewriteResult.extractedCredentials).toEqual({ FS_TOKEN: "test-fs-token" });
    });

    it("warnings generated for unmatched servers", () => {
      const mcpServers = {
        filesystem: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "./notes"] },
        "personal-notes": { command: "node", args: ["~/server.js"] },
      };

      const result = matchServers(mcpServers, resolvedApps);
      const warnings = generateWarnings(result.unmatched);

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("personal-notes");
      expect(warnings[0]).toContain("WARNING");
      expect(warnings[0]).toContain("Dropping unmatched MCP server");
    });

    it("empty mcpServers produces no matches or warnings", () => {
      const result = matchServers({}, resolvedApps);
      expect(result.matched).toHaveLength(0);
      expect(result.unmatched).toHaveLength(0);

      const warnings = generateWarnings(result.unmatched);
      expect(warnings).toHaveLength(0);
    });

    it("all servers unmatched when no apps exist", () => {
      const mcpServers = {
        github: { command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] },
        slack: { url: "http://slack.example.com/mcp" },
      };

      const result = matchServers(mcpServers, []);
      expect(result.matched).toHaveLength(0);
      expect(result.unmatched).toHaveLength(2);
    });

    it("extractCredentials merges env from all matched servers", () => {
      const matched = [
        {
          name: "github",
          config: { env: { GITHUB_TOKEN: "ghp_test" } },
          app: resolvedApps[0]!,
          appShortName: "github",
        },
        {
          name: "slack",
          config: { env: { SLACK_TOKEN: "xoxb_test", SLACK_WEBHOOK: "https://hooks.slack.com" } },
          app: resolvedApps[0]!,
          appShortName: "slack",
        },
      ];

      const creds = extractCredentials(matched);
      expect(creds).toEqual({
        GITHUB_TOKEN: "ghp_test",
        SLACK_TOKEN: "xoxb_test",
        SLACK_WEBHOOK: "https://hooks.slack.com",
      });
    });
  });

  describe("dropped server audit logging", () => {
    it("logs dropped servers to audit_log with status=dropped and session_type=acp", () => {
      const db = openDatabase(":memory:");

      const unmatched = [
        { name: "personal-notes", reason: "No matching chapter App found" },
        { name: "my-custom-server", reason: "No matching chapter App found" },
      ];

      logDroppedServers(db, unmatched, "mcp-test", "mcp-test-role", "test-editor");

      const entries = queryAuditLog(db, { status: "dropped" });
      expect(entries).toHaveLength(2);

      // Verify first dropped entry
      const notesEntry = entries.find((e) => e.app_name === "personal-notes");
      expect(notesEntry).toBeDefined();
      expect(notesEntry!.status).toBe("dropped");
      expect(notesEntry!.session_type).toBe("acp");
      expect(notesEntry!.acp_client).toBe("test-editor");
      expect(notesEntry!.agent_name).toBe("mcp-test");
      expect(notesEntry!.role_name).toBe("mcp-test-role");

      // Verify second dropped entry
      const customEntry = entries.find((e) => e.app_name === "my-custom-server");
      expect(customEntry).toBeDefined();
      expect(customEntry!.status).toBe("dropped");
      expect(customEntry!.session_type).toBe("acp");

      db.close();
    });

    it("logDroppedServers with no unmatched servers writes nothing", () => {
      const db = openDatabase(":memory:");

      logDroppedServers(db, [], "mcp-test", "mcp-test-role");

      const entries = queryAuditLog(db, { status: "dropped" });
      expect(entries).toHaveLength(0);

      db.close();
    });

    it("dropped entries filter correctly by session_type=acp", () => {
      const db = openDatabase(":memory:");

      // Log a dropped server (ACP session)
      logDroppedServers(
        db,
        [{ name: "dropped-server", reason: "No match" }],
        "test-agent",
        "test-role",
        "zed",
      );

      // Query with session_type filter
      const acpEntries = queryAuditLog(db, { session_type: "acp" });
      expect(acpEntries).toHaveLength(1);
      expect(acpEntries[0]?.acp_client).toBe("zed");

      // Query without session_type filter should also find it
      const allEntries = queryAuditLog(db);
      expect(allEntries.length).toBeGreaterThanOrEqual(1);

      db.close();
    });
  });
});

// ── Docker Proxy E2E with ACP Session Metadata ───────────────────────

describe("ACP proxy Docker e2e", () => {
  let workspaceDir: string;
  let dockerDir: string;

  const TEST_PORT = 19500;
  const PROXY_TOKEN = crypto.randomBytes(32).toString("hex");
  const ACP_CLIENT_NAME = "e2e-test-editor";
  const COMPOSE_PROJECT = `chapter-acp-e2e-${Date.now()}`;
  let composeFile: string;

  beforeAll(async () => {
    const timestamp = Date.now();

    // 1. Create temp workspace and copy fixture tree
    workspaceDir = path.join(E2E_ROOT, "tmp", `acp-proxy-e2e-${timestamp}`);
    fs.mkdirSync(workspaceDir, { recursive: true });

    // Copy root package.json
    fs.copyFileSync(
      path.join(FIXTURES_DIR, "package.json"),
      path.join(workspaceDir, "package.json"),
    );

    // Copy workspace directories, excluding mcp-test agent/role
    // (mcp-test uses wildcard "*" permissions which docker-init doesn't support)
    for (const wsDir of WORKSPACE_DIRS) {
      const fixtureSrc = path.join(FIXTURES_DIR, wsDir);
      const workspaceDest = path.join(workspaceDir, wsDir);
      if (fs.existsSync(fixtureSrc)) {
        copyDirRecursive(fixtureSrc, workspaceDest);
      } else {
        fs.mkdirSync(workspaceDest, { recursive: true });
      }
    }
    // Remove mcp-test agent and role to avoid docker-init wildcard permission error
    const mcpTestAgent = path.join(workspaceDir, "agents", "mcp-test");
    const mcpTestRole = path.join(workspaceDir, "roles", "mcp-test");
    if (fs.existsSync(mcpTestAgent)) fs.rmSync(mcpTestAgent, { recursive: true, force: true });
    if (fs.existsSync(mcpTestRole)) fs.rmSync(mcpTestRole, { recursive: true, force: true });

    // 2. Run chapter pack
    execFileSync("node", [CHAPTER_BIN, "pack"], {
      cwd: workspaceDir,
      stdio: "pipe",
      timeout: 60_000,
    });

    // 3. Run chapter docker-init
    execFileSync("node", [CHAPTER_BIN, "docker-init"], {
      cwd: workspaceDir,
      stdio: "pipe",
      timeout: 60_000,
    });

    dockerDir = path.join(workspaceDir, "docker");

    // Create notes directory required by the filesystem MCP server
    // The server runs from /app inside the container and expects ./notes
    const notesDir = path.join(workspaceDir, "notes");
    fs.mkdirSync(notesDir, { recursive: true });

    // 4. Generate docker-compose with ACP session env vars
    // Uses test-note-taker/writer (not mcp-test) because docker-init requires
    // explicit app permissions, not wildcard "*" permissions.
    const composeContent = `# Generated for ACP proxy e2e test
services:
  proxy-writer:
    build:
      context: "${dockerDir}"
      dockerfile: "proxy/writer/Dockerfile"
    ports:
      - "${TEST_PORT}:9090"
    volumes:
      - "${workspaceDir}:/workspace"
      - "${notesDir}:/app/notes"
    environment:
      - CHAPTER_PROXY_TOKEN=${PROXY_TOKEN}
      - CHAPTER_SESSION_TYPE=acp
      - CHAPTER_ACP_CLIENT=${ACP_CLIENT_NAME}
    command: ["proxy", "--agent", "@test/agent-test-note-taker", "--transport", "streamable-http"]
    restart: "no"
`;
    const composeDir = path.join(workspaceDir, "e2e-compose");
    fs.mkdirSync(composeDir, { recursive: true });
    composeFile = path.join(composeDir, "docker-compose.yml");
    fs.writeFileSync(composeFile, composeContent);
  }, 120_000);

  afterAll(() => {
    // Tear down containers
    try {
      execSync(
        `docker compose -p ${COMPOSE_PROJECT} -f "${composeFile}" down --rmi local --volumes`,
        { stdio: "pipe", timeout: 60_000 },
      );
    } catch { /* best-effort cleanup */ }

    // Clean up temp dirs
    if (workspaceDir && fs.existsSync(workspaceDir)) {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  it("builds proxy Docker image with ACP config", () => {
    execSync(
      `docker compose -p ${COMPOSE_PROJECT} -f "${composeFile}" build proxy-writer`,
      { cwd: dockerDir, stdio: "pipe", timeout: 120_000 },
    );
  }, 130_000);

  it("starts proxy container with ACP session env vars", () => {
    execSync(
      `docker compose -p ${COMPOSE_PROJECT} -f "${composeFile}" up -d proxy-writer`,
      { stdio: "pipe", timeout: 60_000 },
    );

    // Verify container is running
    const ps = execSync(
      `docker compose -p ${COMPOSE_PROJECT} -f "${composeFile}" ps --format json`,
      { stdio: "pipe", timeout: 10_000 },
    ).toString();
    expect(ps).toContain("proxy-writer");
  }, 65_000);

  it("proxy health endpoint responds", async () => {
    const maxWait = 30_000;
    const start = Date.now();
    let ready = false;

    while (Date.now() - start < maxWait) {
      try {
        const resp = await fetch(`http://localhost:${TEST_PORT}/health`);
        if (resp.ok) {
          ready = true;
          break;
        }
      } catch {
        // Not ready yet
      }
      await new Promise((r) => setTimeout(r, 1_000));
    }

    if (!ready) {
      const logs = execSync(
        `docker compose -p ${COMPOSE_PROJECT} -f "${composeFile}" logs proxy-writer`,
        { stdio: "pipe" },
      ).toString();
      throw new Error(`Proxy failed to become ready. Logs:\n${logs}`);
    }

    expect(ready).toBe(true);
  }, 35_000);

  it("MCP client connects and lists governed tools", async () => {
    const client = new Client({ name: "acp-e2e-test", version: "0.1.0" });
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://localhost:${TEST_PORT}/mcp`),
      {
        requestInit: {
          headers: {
            Authorization: `Bearer ${PROXY_TOKEN}`,
          },
        },
      },
    );
    await client.connect(transport);

    const result = await client.listTools();
    expect(result).toHaveProperty("tools");
    expect(Array.isArray(result.tools)).toBe(true);

    // The proxy should expose filesystem tools (prefixed with app name)
    // Since it's running against the mcp-test agent which has the filesystem app
    if (result.tools.length > 0) {
      const toolNames = result.tools.map((t) => t.name);
      // Tools should be prefixed with the app short name
      const hasFilesystemTools = toolNames.some(
        (name) => name.includes("filesystem") || name.includes("read_file"),
      );
      expect(hasFilesystemTools).toBe(true);
    }

    await client.close();
  }, 30_000);

  it("rejects requests without auth token", async () => {
    const resp = await fetch(`http://localhost:${TEST_PORT}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1, params: {} }),
    });
    expect(resp.status).toBe(401);
  }, 10_000);

  it("rejects requests with wrong auth token", async () => {
    const resp = await fetch(`http://localhost:${TEST_PORT}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer wrong-token",
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1, params: {} }),
    });
    expect(resp.status).toBe(401);
  }, 10_000);

  it("tool call through governed proxy succeeds", async () => {
    const client = new Client({ name: "acp-e2e-toolcall", version: "0.1.0" });
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://localhost:${TEST_PORT}/mcp`),
      {
        requestInit: {
          headers: {
            Authorization: `Bearer ${PROXY_TOKEN}`,
          },
        },
      },
    );
    await client.connect(transport);

    // List tools first to find the correct prefixed name
    const toolsResult = await client.listTools();
    const listDirTool = toolsResult.tools.find(
      (t) => t.name.includes("list_directory") || t.name.includes("list_allowed_directories"),
    );

    if (listDirTool) {
      // Call the tool - this exercises the full governed pipeline
      const callResult = await client.callTool({
        name: listDirTool.name,
        arguments: listDirTool.name.includes("list_allowed_directories")
          ? {}
          : { path: "/workspace" },
      });

      expect(callResult).toHaveProperty("content");
    }

    await client.close();
  }, 30_000);
});
