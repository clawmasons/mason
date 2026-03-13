/**
 * E2E Test: MCP Agent with Claude-Native Project
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
import * as crypto from "node:crypto";
import { execSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  copyFixtureWorkspace,
  chapterExec,
  chapterExecJson,
  isDockerAvailable,
  waitForHealth,
} from "./helpers.js";

describe("mcp-agent with claude-native project", () => {
  let workspaceDir: string;
  let dockerDir: string;
  let notesDir: string;

  beforeAll(async () => {
    workspaceDir = copyFixtureWorkspace("mcp-agent", {
      fixture: "claude-test-project",
    });

    // Build for mcp-agent agent type
    chapterExec(
      ["chapter", "build", "writer", "--agent-type", "mcp-agent"],
      workspaceDir,
      { timeout: 120_000 },
    );

    dockerDir = path.join(workspaceDir, ".clawmasons", "docker");

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
      const roles = chapterExecJson<Array<Record<string, unknown>>>(
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
      const roles = chapterExecJson<Array<Record<string, unknown>>>(
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
      const roles = chapterExecJson<Array<Record<string, unknown>>>(
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
      const roles = chapterExecJson<Array<Record<string, unknown>>>(
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
    const PROXY_TOKEN = crypto.randomBytes(32).toString("hex");
    const COMPOSE_PROJECT = `chapter-mcp-agent-e2e-${Date.now()}`;
    let composeFile: string;

    beforeAll(() => {
      if (!isDockerAvailable()) return;

      const composeContent = `# Generated for mcp-agent proxy e2e test
services:
  proxy-writer:
    build:
      context: "${dockerDir}"
      dockerfile: "writer/mcp-proxy/Dockerfile"
    ports:
      - "${PROXY_PORT}:9090"
    volumes:
      - "${workspaceDir}:/home/mason/workspace/project"
      - "${notesDir}:/app/notes"
    environment:
      - CHAPTER_PROXY_TOKEN=${PROXY_TOKEN}
    command: ["chapter", "proxy", "--role", "writer", "--transport", "streamable-http"]
    restart: "no"
`;
      const composeDir = path.join(workspaceDir, "e2e-compose-proxy");
      fs.mkdirSync(composeDir, { recursive: true });
      composeFile = path.join(composeDir, "docker-compose.yml");
      fs.writeFileSync(composeFile, composeContent);
    });

    afterAll(() => {
      if (!isDockerAvailable()) return;
      try {
        execSync(
          `docker compose -p ${COMPOSE_PROJECT} -f "${composeFile}" down --rmi local --volumes`,
          { stdio: "pipe", timeout: 60_000 },
        );
      } catch { /* best-effort cleanup */ }
    });

    it("builds Docker images", () => {
      if (!isDockerAvailable()) return;
      execSync(
        `docker compose -p ${COMPOSE_PROJECT} -f "${composeFile}" build`,
        { cwd: dockerDir, stdio: "pipe", timeout: 180_000 },
      );
    }, 190_000);

    it("starts proxy service", () => {
      if (!isDockerAvailable()) return;
      execSync(
        `docker compose -p ${COMPOSE_PROJECT} -f "${composeFile}" up -d proxy-writer`,
        { stdio: "pipe", timeout: 60_000 },
      );

      const ps = execSync(
        `docker compose -p ${COMPOSE_PROJECT} -f "${composeFile}" ps --format json`,
        { stdio: "pipe", timeout: 10_000 },
      ).toString();
      expect(ps).toContain("proxy-writer");
    }, 65_000);

    it("proxy health endpoint responds", async () => {
      if (!isDockerAvailable()) return;
      await waitForHealth(`http://localhost:${PROXY_PORT}/health`, 30_000, {
        composeProject: COMPOSE_PROJECT,
        composeFile,
        service: "proxy-writer",
      });
    }, 35_000);

    it("MCP client lists governed filesystem tools", async () => {
      if (!isDockerAvailable()) return;

      const client = new Client({ name: "mcp-agent-e2e-test", version: "0.1.0" });
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
  });
});
