/**
 * E2E Test: Note-Taker Materialization on Pi-Coding-Agent with OpenRouter
 *
 * Validates that `chapter install @test/member-test-note-taker` produces
 * a correct pi-coding-agent workspace, Docker Compose service, Dockerfile,
 * and .env configuration when the member uses pi-coding-agent runtime
 * with OpenRouter as the LLM provider.
 *
 * The test creates a temporary workspace from fixtures, runs the full
 * chapter init + install pipeline, and asserts on the generated output.
 *
 * PRD refs: REQ-005, PRD section 5.7
 * Change: #8 — E2E Test — Note-Taker Materialization & Docker Compose Validation
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const E2E_ROOT = path.resolve(__dirname, "..");
const PROJECT_ROOT = path.resolve(E2E_ROOT, "..");
const FIXTURES_DIR = path.join(E2E_ROOT, "fixtures", "test-chapter");
const CHAPTER_BIN = path.join(PROJECT_ROOT, "bin", "chapter.js");
const CHAPTER_CORE_DIR = path.join(PROJECT_ROOT, "chapter-core");

/** Workspace directories that chapter expects. */
const WORKSPACE_DIRS = ["apps", "tasks", "skills", "roles", "members"];

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

describe("note-taker on pi-coding-agent with OpenRouter", () => {
  let workspaceDir: string;
  let memberOutputDir: string;

  beforeAll(() => {
    // 1. Create temp workspace
    const timestamp = Date.now();
    workspaceDir = path.join(E2E_ROOT, "tmp", `chapter-e2e-${timestamp}`);
    fs.mkdirSync(workspaceDir, { recursive: true });

    // 2. Copy fixture root package.json
    fs.copyFileSync(
      path.join(FIXTURES_DIR, "package.json"),
      path.join(workspaceDir, "package.json"),
    );

    // 3. Copy fixture workspace directories
    for (const wsDir of WORKSPACE_DIRS) {
      const fixtureSrc = path.join(FIXTURES_DIR, wsDir);
      const workspaceDest = path.join(workspaceDir, wsDir);
      if (fs.existsSync(fixtureSrc)) {
        copyDirRecursive(fixtureSrc, workspaceDest);
      } else {
        fs.mkdirSync(workspaceDest, { recursive: true });
      }
    }

    // 4. Link @clawmasons/chapter-core into node_modules
    //    chapter-core is a local workspace package (not published to npm),
    //    so we symlink it to make discoverPackages() find its sub-packages.
    const nmScopePath = path.join(workspaceDir, "node_modules", "@clawmasons");
    fs.mkdirSync(nmScopePath, { recursive: true });
    fs.symlinkSync(CHAPTER_CORE_DIR, path.join(nmScopePath, "chapter-core"));

    // 5. Run chapter init
    execFileSync("node", [CHAPTER_BIN, "init"], {
      cwd: workspaceDir,
      stdio: "pipe",
      timeout: 30_000,
    });

    // 6. Run chapter install @test/member-test-note-taker
    execFileSync(
      "node",
      [CHAPTER_BIN, "install", "@test/member-test-note-taker"],
      {
        cwd: workspaceDir,
        stdio: "pipe",
        timeout: 30_000,
      },
    );

    // 7. Determine member output directory
    memberOutputDir = path.join(
      workspaceDir,
      ".chapter",
      "members",
      "test-note-taker",
    );
  }, 120_000);

  afterAll(() => {
    if (workspaceDir && fs.existsSync(workspaceDir)) {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  // ── Workspace Materialization ────────────────────────────────────────

  describe("workspace materialization", () => {
    it("generates AGENTS.md", () => {
      const agentsMdPath = path.join(
        memberOutputDir,
        "pi-coding-agent",
        "workspace",
        "AGENTS.md",
      );
      expect(fs.existsSync(agentsMdPath)).toBe(true);
    });

    it("AGENTS.md contains agent identity and role-writer context", () => {
      const agentsMd = fs.readFileSync(
        path.join(
          memberOutputDir,
          "pi-coding-agent",
          "workspace",
          "AGENTS.md",
        ),
        "utf-8",
      );

      // Agent identity
      expect(agentsMd).toContain("# Agent:");
      expect(agentsMd).toContain("managed by chapter");

      // Role-writer context
      expect(agentsMd).toContain("writer");
      expect(agentsMd).toContain("Permitted tools");
      expect(agentsMd).toContain("filesystem");
    });

    it("generates .pi/settings.json with correct model ID", () => {
      const settingsPath = path.join(
        memberOutputDir,
        "pi-coding-agent",
        "workspace",
        ".pi",
        "settings.json",
      );
      expect(fs.existsSync(settingsPath)).toBe(true);

      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      expect(settings.model).toBe("openrouter/anthropic/claude-sonnet-4");
    });

    it("generates .pi/extensions/chapter-mcp/index.ts", () => {
      const indexTsPath = path.join(
        memberOutputDir,
        "pi-coding-agent",
        "workspace",
        ".pi",
        "extensions",
        "chapter-mcp",
        "index.ts",
      );
      expect(fs.existsSync(indexTsPath)).toBe(true);
    });

    it("generates .pi/extensions/chapter-mcp/package.json", () => {
      const pkgPath = path.join(
        memberOutputDir,
        "pi-coding-agent",
        "workspace",
        ".pi",
        "extensions",
        "chapter-mcp",
        "package.json",
      );
      expect(fs.existsSync(pkgPath)).toBe(true);

      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      expect(pkg.name).toBe("chapter-mcp");
      expect(pkg.type).toBe("module");
    });

    it("extension code registers MCP server", () => {
      const indexTs = fs.readFileSync(
        path.join(
          memberOutputDir,
          "pi-coding-agent",
          "workspace",
          ".pi",
          "extensions",
          "chapter-mcp",
          "index.ts",
        ),
        "utf-8",
      );

      expect(indexTs).toContain("pi.registerMcpServer(");
      expect(indexTs).toContain('"chapter"');
    });

    it("extension code registers take-notes command", () => {
      const indexTs = fs.readFileSync(
        path.join(
          memberOutputDir,
          "pi-coding-agent",
          "workspace",
          ".pi",
          "extensions",
          "chapter-mcp",
          "index.ts",
        ),
        "utf-8",
      );

      expect(indexTs).toContain("pi.registerCommand(");
      expect(indexTs).toContain('"take-notes"');
    });

    it("extension code has baked proxy token (not process.env placeholder)", () => {
      const indexTs = fs.readFileSync(
        path.join(
          memberOutputDir,
          "pi-coding-agent",
          "workspace",
          ".pi",
          "extensions",
          "chapter-mcp",
          "index.ts",
        ),
        "utf-8",
      );

      // Should have a baked Bearer token (hex string), not the process.env reference
      expect(indexTs).toContain("Bearer ");
      expect(indexTs).not.toContain("process.env.CHAPTER_PROXY_TOKEN");
    });

    it("generates skills/markdown-conventions/README.md", () => {
      const skillPath = path.join(
        memberOutputDir,
        "pi-coding-agent",
        "workspace",
        "skills",
        "markdown-conventions",
        "README.md",
      );
      expect(fs.existsSync(skillPath)).toBe(true);

      const content = fs.readFileSync(skillPath, "utf-8");
      expect(content).toContain("markdown-conventions");
      expect(content).toContain("Markdown formatting conventions");
    });
  });

  // ── Docker Compose ───────────────────────────────────────────────────

  describe("Docker Compose generation", () => {
    it("generates docker-compose.yml", () => {
      const composePath = path.join(memberOutputDir, "docker-compose.yml");
      expect(fs.existsSync(composePath)).toBe(true);
    });

    it("docker-compose.yml contains pi-coding-agent service", () => {
      const compose = fs.readFileSync(
        path.join(memberOutputDir, "docker-compose.yml"),
        "utf-8",
      );
      expect(compose).toContain("pi-coding-agent:");
    });

    it("pi-coding-agent service builds from correct directory", () => {
      const compose = fs.readFileSync(
        path.join(memberOutputDir, "docker-compose.yml"),
        "utf-8",
      );
      expect(compose).toContain("build: ./pi-coding-agent");
    });

    it("pi-coding-agent service depends on mcp-proxy", () => {
      const compose = fs.readFileSync(
        path.join(memberOutputDir, "docker-compose.yml"),
        "utf-8",
      );
      expect(compose).toContain("mcp-proxy");
    });

    it("pi-coding-agent service includes OPENROUTER_API_KEY env var", () => {
      const compose = fs.readFileSync(
        path.join(memberOutputDir, "docker-compose.yml"),
        "utf-8",
      );
      expect(compose).toContain("OPENROUTER_API_KEY");
    });
  });

  // ── Env Configuration ────────────────────────────────────────────────

  describe("env configuration", () => {
    it("generates .env file", () => {
      const envPath = path.join(memberOutputDir, ".env");
      expect(fs.existsSync(envPath)).toBe(true);
    });

    it(".env contains OPENROUTER_API_KEY", () => {
      const env = fs.readFileSync(
        path.join(memberOutputDir, ".env"),
        "utf-8",
      );
      expect(env).toContain("OPENROUTER_API_KEY=");
    });

    it(".env contains CHAPTER_PROXY_TOKEN with a generated value", () => {
      const env = fs.readFileSync(
        path.join(memberOutputDir, ".env"),
        "utf-8",
      );
      const match = env.match(/CHAPTER_PROXY_TOKEN=(\S+)/);
      expect(match).not.toBeNull();
      // Token should be a 64-char hex string (32 bytes)
      expect(match![1]).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  // ── Dockerfile ───────────────────────────────────────────────────────

  describe("Dockerfile", () => {
    it("generates pi-coding-agent Dockerfile", () => {
      const dockerfilePath = path.join(
        memberOutputDir,
        "pi-coding-agent",
        "Dockerfile",
      );
      expect(fs.existsSync(dockerfilePath)).toBe(true);
    });

    it("Dockerfile installs @mariozechner/pi-coding-agent", () => {
      const dockerfile = fs.readFileSync(
        path.join(memberOutputDir, "pi-coding-agent", "Dockerfile"),
        "utf-8",
      );
      expect(dockerfile).toContain(
        "npm install -g @mariozechner/pi-coding-agent",
      );
    });

    it("Dockerfile uses pi --no-session --mode print CMD", () => {
      const dockerfile = fs.readFileSync(
        path.join(memberOutputDir, "pi-coding-agent", "Dockerfile"),
        "utf-8",
      );
      expect(dockerfile).toContain('CMD ["pi", "--no-session", "--mode", "print"]');
    });
  });

  // ── Infrastructure (gated) ──────────────────────────────────────────

  describe("infrastructure (requires Docker)", () => {
    it.skip("pi agent can connect to chapter proxy via Docker Compose", () => {
      // Future: Start docker compose, verify pi connects to MCP proxy,
      // verify tools are available (read_file, write_file, etc.)
      // Gated behind: docker info succeeds
    });
  });

  describe("infrastructure (requires OPENROUTER_API_KEY)", () => {
    it.skip("pi agent can execute a note-taking task", () => {
      // Future: Start docker compose with OPENROUTER_API_KEY,
      // send a note-taking prompt to pi, verify markdown file created.
      // Gated behind: OPENROUTER_API_KEY is set in environment
    });
  });
});
