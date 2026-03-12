import { type MockInstance, describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  readChapterConfig,
  createDockerPackageJson,
  runDockerInit,
  generateDockerfiles,
} from "../../src/cli/commands/docker-init.js";

describe("readChapterConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-docker-init-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reads valid chapter.json", () => {
    fs.mkdirSync(path.join(tmpDir, ".clawmasons"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".clawmasons", "chapter.json"),
      JSON.stringify({ chapter: "acme.platform", version: "0.1.0" }),
    );

    const config = readChapterConfig(tmpDir);
    expect(config.chapter).toBe("acme.platform");
    expect(config.version).toBe("0.1.0");
  });

  it("throws when .clawmasons/chapter.json is missing", () => {
    expect(() => readChapterConfig(tmpDir)).toThrow("No .clawmasons/chapter.json found");
  });

  it("throws when chapter.json is invalid JSON", () => {
    fs.mkdirSync(path.join(tmpDir, ".clawmasons"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".clawmasons", "chapter.json"),
      "not json",
    );

    expect(() => readChapterConfig(tmpDir)).toThrow("not valid JSON");
  });

  it("throws when chapter field is missing", () => {
    fs.mkdirSync(path.join(tmpDir, ".clawmasons"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".clawmasons", "chapter.json"),
      JSON.stringify({ version: "0.1.0" }),
    );

    expect(() => readChapterConfig(tmpDir)).toThrow('must contain a "chapter" field');
  });

  it("throws when chapter name is not in lodge.chapter format", () => {
    fs.mkdirSync(path.join(tmpDir, ".clawmasons"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".clawmasons", "chapter.json"),
      JSON.stringify({ chapter: "nodot" }),
    );

    expect(() => readChapterConfig(tmpDir)).toThrow("<lodge>.<chapter> format");
  });

  it("throws when chapter name starts with a dot", () => {
    fs.mkdirSync(path.join(tmpDir, ".clawmasons"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".clawmasons", "chapter.json"),
      JSON.stringify({ chapter: ".bad.name" }),
    );

    expect(() => readChapterConfig(tmpDir)).toThrow("<lodge>.<chapter> format");
  });

  it("throws when chapter name ends with a dot", () => {
    fs.mkdirSync(path.join(tmpDir, ".clawmasons"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".clawmasons", "chapter.json"),
      JSON.stringify({ chapter: "bad.name." }),
    );

    expect(() => readChapterConfig(tmpDir)).toThrow("<lodge>.<chapter> format");
  });
});

describe("createDockerPackageJson", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-docker-init-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates docker/ directory and package.json", () => {
    createDockerPackageJson(tmpDir, "acme.platform");

    const dockerDir = path.join(tmpDir, "docker");
    expect(fs.existsSync(dockerDir)).toBe(true);
    expect(fs.statSync(dockerDir).isDirectory()).toBe(true);

    const pkgJsonPath = path.join(dockerDir, "package.json");
    expect(fs.existsSync(pkgJsonPath)).toBe(true);

    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
    expect(pkg.name).toBe("@acme.platform/docker");
    expect(pkg.private).toBe(true);
    expect(pkg.description).toContain("acme.platform");
    expect(pkg.dependencies).toBeUndefined();
  });

  it("overwrites existing docker/package.json", () => {
    fs.mkdirSync(path.join(tmpDir, "docker"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "docker", "package.json"),
      JSON.stringify({ name: "old" }),
    );

    createDockerPackageJson(tmpDir, "acme.platform");

    const pkg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, "docker", "package.json"), "utf-8"),
    );
    expect(pkg.name).toBe("@acme.platform/docker");
  });
});


describe("runDockerInit", () => {
  let tmpDir: string;
  let exitSpy: MockInstance;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-docker-init-test-"));
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function setupChapterProject(chapterName: string): void {
    // Create .clawmasons/chapter.json
    fs.mkdirSync(path.join(tmpDir, ".clawmasons"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".clawmasons", "chapter.json"),
      JSON.stringify({ chapter: chapterName, version: "0.1.0" }),
    );

    // Create root package.json
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({
        name: `@${chapterName}/chapter`,
        version: "0.1.0",
        private: true,
        workspaces: ["apps/*", "tasks/*", "skills/*", "roles/*", "agents/*"],
      }),
    );
  }

  it("creates docker/package.json with correct chapter scope", async () => {
    setupChapterProject("acme.platform");

    await runDockerInit(tmpDir, { skipInstall: true });

    expect(exitSpy).not.toHaveBeenCalledWith(1);

    const dockerPkg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, "docker", "package.json"), "utf-8"),
    );
    expect(dockerPkg.name).toBe("@acme.platform/docker");
    expect(dockerPkg.private).toBe(true);
  });

  it("docker/package.json has no dependencies (packages copied directly)", async () => {
    setupChapterProject("acme.platform");

    await runDockerInit(tmpDir, { skipInstall: true });

    expect(exitSpy).not.toHaveBeenCalledWith(1);

    const dockerPkg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, "docker", "package.json"), "utf-8"),
    );
    expect(dockerPkg.dependencies).toBeUndefined();
  });

  it("prints chapter name during init", async () => {
    setupChapterProject("myorg.workspace");

    await runDockerInit(tmpDir, { skipInstall: true });

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("myorg.workspace");
    expect(logOutput).toContain("docker-init complete");
  });

  it("exits 1 when .clawmasons/chapter.json is missing", async () => {
    // No chapter project setup — just an empty dir
    await runDockerInit(tmpDir, { skipInstall: true });

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("docker-init failed");
    expect(errorOutput).toContain(".clawmasons/chapter.json");
  });

  it("does not modify root package.json", async () => {
    setupChapterProject("acme.platform");
    const pkgPath = path.join(tmpDir, "package.json");
    const originalContent = fs.readFileSync(pkgPath, "utf-8");

    await runDockerInit(tmpDir, { skipInstall: true });

    expect(fs.readFileSync(pkgPath, "utf-8")).toBe(originalContent);
  });
});

// ── Dockerfile Generation Integration Tests ────────────────────────────

describe("generateDockerfiles", () => {
  let tmpDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-docker-gen-test-"));
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Create a mock chapter package in node_modules.
   */
  function createPackage(
    scope: string,
    name: string,
    chapter: Record<string, unknown>,
    version = "1.0.0",
  ): void {
    const pkgDir = path.join(tmpDir, "node_modules", scope, name);
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, "package.json"),
      JSON.stringify({
        name: `${scope}/${name}`,
        version,
        chapter,
      }),
    );
  }

  function setupMockNodeModules(): void {
    // Create package.json in dockerDir root
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "@test/docker", version: "0.0.0", private: true }),
    );

    // App: filesystem
    createPackage("@acme.platform", "app-filesystem", {
      type: "app",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem"],
      tools: ["read_file", "write_file"],
      capabilities: ["tools"],
    });

    // App: github
    createPackage("@acme.platform", "app-github", {
      type: "app",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      tools: ["create_issue", "list_repos"],
      capabilities: ["tools"],
    });

    // Task: write-notes (depends on app-filesystem)
    createPackage("@acme.platform", "task-write-notes", {
      type: "task",
      taskType: "subagent",
      prompt: "./prompts/write.md",
      requires: {
        apps: ["@acme.platform/app-filesystem"],
      },
    });

    // Task: triage-issue (depends on app-github)
    createPackage("@acme.platform", "task-triage-issue", {
      type: "task",
      taskType: "subagent",
      prompt: "./prompts/triage.md",
      requires: {
        apps: ["@acme.platform/app-github"],
      },
    });

    // Role: writer (has task-write-notes, app-filesystem in permissions)
    createPackage("@acme.platform", "role-writer", {
      type: "role",
      description: "Writes notes",
      tasks: ["@acme.platform/task-write-notes"],
      permissions: {
        "@acme.platform/app-filesystem": {
          allow: ["read_file", "write_file"],
          deny: [],
        },
      },
    });

    // Role: reviewer (has task-triage-issue, app-github in permissions)
    createPackage("@acme.platform", "role-reviewer", {
      type: "role",
      description: "Reviews issues",
      tasks: ["@acme.platform/task-triage-issue"],
      permissions: {
        "@acme.platform/app-github": {
          allow: ["create_issue", "list_repos"],
          deny: [],
        },
      },
    });

  }

  it("generates proxy Dockerfile for each role", () => {
    setupMockNodeModules();

    generateDockerfiles(tmpDir);

    expect(fs.existsSync(path.join(tmpDir, "proxy", "writer", "Dockerfile"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "proxy", "reviewer", "Dockerfile"))).toBe(true);
  });

  it("generates agent Dockerfile for each role", () => {
    setupMockNodeModules();

    generateDockerfiles(tmpDir);

    expect(fs.existsSync(path.join(tmpDir, "agent", "writer", "writer", "Dockerfile"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "agent", "reviewer", "reviewer", "Dockerfile"))).toBe(true);
  });

  it("proxy Dockerfiles contain USER mason", () => {
    setupMockNodeModules();

    generateDockerfiles(tmpDir);

    const writerDockerfile = fs.readFileSync(
      path.join(tmpDir, "proxy", "writer", "Dockerfile"), "utf-8",
    );
    const reviewerDockerfile = fs.readFileSync(
      path.join(tmpDir, "proxy", "reviewer", "Dockerfile"), "utf-8",
    );

    expect(writerDockerfile).toContain("USER mason");
    expect(reviewerDockerfile).toContain("USER mason");
  });

  it("agent Dockerfiles contain USER mason", () => {
    setupMockNodeModules();

    generateDockerfiles(tmpDir);

    const writerDockerfile = fs.readFileSync(
      path.join(tmpDir, "agent", "writer", "writer", "Dockerfile"), "utf-8",
    );
    const reviewerDockerfile = fs.readFileSync(
      path.join(tmpDir, "agent", "reviewer", "reviewer", "Dockerfile"), "utf-8",
    );

    expect(writerDockerfile).toContain("USER mason");
    expect(reviewerDockerfile).toContain("USER mason");
  });

  it("proxy Dockerfiles use pre-populated node_modules (no npm install)", () => {
    setupMockNodeModules();

    generateDockerfiles(tmpDir);

    const dockerfile = fs.readFileSync(
      path.join(tmpDir, "proxy", "writer", "Dockerfile"), "utf-8",
    );

    expect(dockerfile).not.toContain("docker.io");
    expect(dockerfile).not.toContain("ghcr.io");
    expect(dockerfile).toContain("COPY node_modules/");
    expect(dockerfile).not.toContain("npm install");
    expect(dockerfile).toContain("npm rebuild better-sqlite3");
  });

  it("agent Dockerfiles use pre-populated node_modules (no npm install --omit=dev)", () => {
    setupMockNodeModules();

    generateDockerfiles(tmpDir);

    const dockerfile = fs.readFileSync(
      path.join(tmpDir, "agent", "writer", "writer", "Dockerfile"), "utf-8",
    );

    expect(dockerfile).not.toContain("docker.io");
    expect(dockerfile).not.toContain("ghcr.io");
    expect(dockerfile).toContain("COPY node_modules/");
    expect(dockerfile).not.toContain("npm install --omit=dev");
  });

  it("generates materialized workspace for each role", () => {
    setupMockNodeModules();

    generateDockerfiles(tmpDir);

    // Claude-code workspace should have .mcp.json, AGENTS.md, etc.
    const writerWorkspace = path.join(tmpDir, "agent", "writer", "writer", "workspace");
    expect(fs.existsSync(path.join(writerWorkspace, ".mcp.json"))).toBe(true);
    expect(fs.existsSync(path.join(writerWorkspace, "AGENTS.md"))).toBe(true);
    expect(fs.existsSync(path.join(writerWorkspace, ".claude", "settings.json"))).toBe(true);

    const reviewerWorkspace = path.join(tmpDir, "agent", "reviewer", "reviewer", "workspace");
    expect(fs.existsSync(path.join(reviewerWorkspace, ".mcp.json"))).toBe(true);
    expect(fs.existsSync(path.join(reviewerWorkspace, "AGENTS.md"))).toBe(true);
  });

  it("skips Dockerfile generation when no chapter packages found", () => {
    // Empty node_modules
    fs.mkdirSync(path.join(tmpDir, "node_modules"), { recursive: true });

    generateDockerfiles(tmpDir);

    expect(fs.existsSync(path.join(tmpDir, "proxy"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, "agent"))).toBe(false);

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("No chapter packages found");
  });

  it("skips Dockerfile generation when no role packages found", () => {
    // Only create an app package (no role)
    createPackage("@acme.platform", "app-github", {
      type: "app",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      tools: ["create_issue"],
      capabilities: ["tools"],
    });

    generateDockerfiles(tmpDir);

    expect(fs.existsSync(path.join(tmpDir, "proxy"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, "agent"))).toBe(false);

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("No role packages found");
  });

  it("logs Dockerfile creation for each proxy and agent file", () => {
    setupMockNodeModules();

    generateDockerfiles(tmpDir);

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("proxy/writer/Dockerfile");
    expect(logOutput).toContain("proxy/reviewer/Dockerfile");
    expect(logOutput).toContain("agent/writer/writer/Dockerfile");
    expect(logOutput).toContain("agent/reviewer/reviewer/Dockerfile");
  });

  it("proxy Dockerfile uses clawmasons proxy entrypoint", () => {
    setupMockNodeModules();

    generateDockerfiles(tmpDir);

    const dockerfile = fs.readFileSync(
      path.join(tmpDir, "proxy", "writer", "Dockerfile"), "utf-8",
    );
    expect(dockerfile).toContain("clawmasons");
    expect(dockerfile).toContain("proxy");
    expect(dockerfile).toContain("--agent");
  });

  it("agent Dockerfile uses runtime-specific entrypoint", () => {
    setupMockNodeModules();

    generateDockerfiles(tmpDir);

    const dockerfile = fs.readFileSync(
      path.join(tmpDir, "agent", "writer", "writer", "Dockerfile"), "utf-8",
    );
    // claude-code agent
    expect(dockerfile).toContain('ENTRYPOINT ["claude"]');
  });

  it("generates Dockerfiles for all discovered roles", () => {
    setupMockNodeModules();

    generateDockerfiles(tmpDir);

    // Should have proxy Dockerfiles for both roles
    expect(fs.existsSync(path.join(tmpDir, "proxy", "writer", "Dockerfile"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "proxy", "reviewer", "Dockerfile"))).toBe(true);

    // Should have agent Dockerfiles for each role
    expect(fs.existsSync(path.join(tmpDir, "agent", "writer", "writer", "Dockerfile"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "agent", "reviewer", "reviewer", "Dockerfile"))).toBe(true);
  });
});
