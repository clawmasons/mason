/**
 * E2E Test: MCP Proxy with Claude-Native Project
 *
 * Exercises the full role-based pipeline using a native .claude format project:
 *   1. Copy claude-test-project fixture (inline mcp_servers, .claude/ commands/skills)
 *   2. Verify role discovery (chapter list --json)
 *   3. Build for mcp-agent (chapter build --agent-type mcp-agent)
 *   4. Start proxy, connect MCP client, list governed tools
 *
 * This validates that inline mcp_servers in ROLE.md are correctly:
 *   - Parsed into RoleType apps
 *   - Synthesized as proxy-discoverable packages during build
 *   - Served as governed MCP tools through the proxy
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  copyFixtureWorkspace,
  masonExec,
  masonExecJson,
  isDockerAvailable,
  waitForHealth,
} from "./helpers.js";

describe("mcp-proxy with claude-native project", () => {
  let workspaceDir: string;
  let dockerDir: string;
  let notesDir: string;

  beforeAll(async () => {
    workspaceDir = copyFixtureWorkspace("mcp-agent", {
      fixture: "claude-test-project",
    });

    // Build for mcp-agent agent type
    masonExec(
      ["chapter", "build", "writer", "--agent-type", "mcp-agent"],
      workspaceDir,
      { timeout: 120_000 },
    );

    dockerDir = path.join(workspaceDir, ".mason", "docker");

    // Create notes directory required by the filesystem MCP server
    notesDir = path.join(workspaceDir, "notes");
    fs.mkdirSync(notesDir, { recursive: true });
  }, 120_000);

  afterAll(() => {
    if (workspaceDir && fs.existsSync(workspaceDir)) {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  // -- Role Discovery ---------------------------------------------------------

  describe("role discovery", () => {
    it("discovers writer role from .claude/roles/", () => {
      const roles = masonExecJson<Array<Record<string, unknown>>>(
        ["chapter", "list", "--json"],
        workspaceDir,
      );

      const writer = roles.find(
        (r) => (r.metadata as Record<string, unknown>)?.name === "writer",
      );
      expect(writer).toBeDefined();
      expect(
        (writer!.source as Record<string, unknown>).agentDialect,
      ).toBe("claude-code");
    });

    it("writer role has inline mcp_servers parsed as apps", () => {
      const roles = masonExecJson<Array<Record<string, unknown>>>(
        ["chapter", "list", "--json"],
        workspaceDir,
      );

      const writer = roles.find(
        (r) => (r.metadata as Record<string, unknown>)?.name === "writer",
      );
      expect(writer).toBeDefined();

      const apps = writer!.apps as Array<Record<string, unknown>>;
      expect(apps).toHaveLength(1);
      expect(apps[0]!.name).toBe("filesystem");
      expect(apps[0]!.transport).toBe("stdio");

      const tools = apps[0]!.tools as Record<string, unknown>;
      expect(tools).toBeDefined();
      expect(tools.allow).toEqual(
        expect.arrayContaining([
          "read_file",
          "write_file",
          "list_directory",
          "create_directory",
        ]),
      );
    });

    it("writer role has tasks normalized from commands", () => {
      const roles = masonExecJson<Array<Record<string, unknown>>>(
        ["chapter", "list", "--json"],
        workspaceDir,
      );

      const writer = roles.find(
        (r) => (r.metadata as Record<string, unknown>)?.name === "writer",
      );
      expect(writer).toBeDefined();

      const tasks = writer!.tasks as Array<Record<string, unknown>>;
      expect(tasks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "take-notes" }),
        ]),
      );
    });

    it("writer role has skills resolved from local path", () => {
      const roles = masonExecJson<Array<Record<string, unknown>>>(
        ["chapter", "list", "--json"],
        workspaceDir,
      );

      const writer = roles.find(
        (r) => (r.metadata as Record<string, unknown>)?.name === "writer",
      );
      expect(writer).toBeDefined();

      const skills = writer!.skills as Array<Record<string, unknown>>;
      expect(skills).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "markdown-conventions" }),
        ]),
      );
    });
  });

  // -- Build Output -----------------------------------------------------------

  describe("build output", () => {
    it("generates mcp-agent Dockerfile for writer role", () => {
      expect(
        fs.existsSync(
          path.join(dockerDir, "writer", "mcp-agent", "Dockerfile"),
        ),
      ).toBe(true);
    });

    it("generates mcp-agent workspace with .mcp.json", () => {
      const mcpJsonPath = path.join(
        dockerDir, "writer", "mcp-agent", "workspace", ".mcp.json",
      );
      expect(fs.existsSync(mcpJsonPath)).toBe(true);

      const mcpConfig = JSON.parse(fs.readFileSync(mcpJsonPath, "utf-8"));
      expect(mcpConfig.mcpServers).toBeDefined();
      expect(mcpConfig.mcpServers.chapter).toBeDefined();
      expect(mcpConfig.mcpServers.chapter.type).toBe("streamable-http");
    });

    it("generates proxy Dockerfile for writer role", () => {
      expect(
        fs.existsSync(path.join(dockerDir, "writer", "mcp-proxy", "Dockerfile")),
      ).toBe(true);
    });

    it("synthesized app package exists in docker node_modules", () => {
      const appPkgPath = path.join(
        dockerDir, "node_modules", "filesystem", "package.json",
      );
      expect(fs.existsSync(appPkgPath)).toBe(true);

      const appPkg = JSON.parse(fs.readFileSync(appPkgPath, "utf-8"));
      expect(appPkg.chapter.type).toBe("app");
      expect(appPkg.chapter.transport).toBe("stdio");
      expect(appPkg.chapter.tools).toEqual(
        expect.arrayContaining(["read_file", "write_file"]),
      );
    });

    it("synthesized role package exists in docker node_modules", () => {
      const rolePkgPath = path.join(
        dockerDir, "node_modules", "writer", "package.json",
      );
      expect(fs.existsSync(rolePkgPath)).toBe(true);

      const rolePkg = JSON.parse(fs.readFileSync(rolePkgPath, "utf-8"));
      expect(rolePkg.chapter.type).toBe("role");
      expect(rolePkg.chapter.permissions.filesystem).toBeDefined();
      expect(rolePkg.chapter.permissions.filesystem.allow).toEqual(
        expect.arrayContaining(["read_file", "write_file"]),
      );
    });
  });

  // -- Proxy Tool Pipeline (requires Docker) ----------------------------------

  describe("proxy tool pipeline", () => {
    const PROXY_PORT = 19700;
    let proxyInfo: {
      proxyPort: number;
      proxyToken: string;
      composeFile: string;
      proxyServiceName: string;
      sessionId: string;
    };

    beforeAll(() => {
      if (!isDockerAvailable()) return;

      // Use the CLI to build, generate compose, and start the proxy — just like a user would
      const output = masonExec(
        ["run", "--role", "writer", "--agent-type", "mcp", "--proxy-only", "--proxy-port", String(PROXY_PORT)],
        workspaceDir,
        { timeout: 240_000 },
      );
      proxyInfo = JSON.parse(output);
    }, 240_000);

    afterAll(() => {
      if (!isDockerAvailable() || !proxyInfo) return;
      try {
        execSync(
          `docker compose -f "${proxyInfo.composeFile}" down --rmi local --volumes`,
          { stdio: "pipe", timeout: 60_000 },
        );
      } catch { /* best-effort cleanup */ }
    });

    it("proxy health endpoint responds", async () => {
      if (!isDockerAvailable()) return;
      await waitForHealth(`http://localhost:${PROXY_PORT}/health`, 30_000);
    }, 35_000);

    it("MCP client lists governed filesystem tools", async () => {
      if (!isDockerAvailable()) return;

      const client = new Client({ name: "mcp-agent-e2e-test", version: "0.1.0" });
      const transport = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${PROXY_PORT}/mcp`),
        {
          requestInit: {
            headers: { Authorization: `Bearer ${proxyInfo.proxyToken}` },
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
  });
});
