import { type MockInstance, describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { program } from "../../src/cli/index.js";
import { runInstall } from "../../src/cli/commands/install.js";

describe("CLI install command", () => {
  it("has the install command registered", () => {
    const installCmd = program.commands.find((cmd) => cmd.name() === "install");
    expect(installCmd).toBeDefined();
    if (installCmd) {
      expect(installCmd.description()).toContain("Install");
    }
  });

  it("install command accepts an agent argument", () => {
    const installCmd = program.commands.find((cmd) => cmd.name() === "install");
    expect(installCmd).toBeDefined();
    if (installCmd) {
      const args = installCmd.registeredArguments;
      expect(args).toHaveLength(1);
      expect(args[0].name()).toBe("agent");
      expect(args[0].required).toBe(true);
    }
  });

  it("install command has --output-dir option", () => {
    const installCmd = program.commands.find((cmd) => cmd.name() === "install");
    expect(installCmd).toBeDefined();
    if (installCmd) {
      const option = installCmd.options.find((opt) => opt.long === "--output-dir");
      expect(option).toBeDefined();
    }
  });
});

describe("runInstall", () => {
  let tmpDir: string;
  let exitSpy: MockInstance;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-install-test-"));
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writePackage(dir: string, pkg: Record<string, unknown>): void {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2));
  }

  function setupValidAgent(): void {
    // App
    writePackage(path.join(tmpDir, "apps", "github"), {
      name: "@test/app-github",
      version: "1.0.0",
      chapter: {
        type: "app",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_TOKEN}" },
        tools: ["create_issue", "list_repos"],
        capabilities: ["tools"],
      },
    });

    // Skill
    writePackage(path.join(tmpDir, "skills", "labeling"), {
      name: "@test/skill-labeling",
      version: "1.0.0",
      chapter: {
        type: "skill",
        artifacts: ["./SKILL.md"],
        description: "Labeling taxonomy",
      },
    });

    // Task
    writePackage(path.join(tmpDir, "tasks", "triage"), {
      name: "@test/task-triage",
      version: "1.0.0",
      chapter: {
        type: "task",
        taskType: "subagent",
        prompt: "./triage.md",
        requires: {
          apps: ["@test/app-github"],
          skills: ["@test/skill-labeling"],
        },
      },
    });

    // Role
    writePackage(path.join(tmpDir, "roles", "manager"), {
      name: "@test/role-manager",
      version: "1.0.0",
      chapter: {
        type: "role",
        tasks: ["@test/task-triage"],
        skills: ["@test/skill-labeling"],
        permissions: {
          "@test/app-github": {
            allow: ["create_issue", "list_repos"],
            deny: [],
          },
        },
      },
    });

    // Agent
    writePackage(path.join(tmpDir, "agents", "ops"), {
      name: "@test/agent-ops",
      version: "1.0.0",
      chapter: {
        type: "agent",
        runtimes: ["claude-code"],
        roles: ["@test/role-manager"],
      },
    });
  }

  function setupInvalidAgent(): void {
    // App
    writePackage(path.join(tmpDir, "apps", "github"), {
      name: "@test/app-github",
      version: "1.0.0",
      chapter: {
        type: "app",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        tools: ["create_issue"],
        capabilities: ["tools"],
      },
    });

    // Skill
    writePackage(path.join(tmpDir, "skills", "labeling"), {
      name: "@test/skill-labeling",
      version: "1.0.0",
      chapter: {
        type: "skill",
        artifacts: ["./SKILL.md"],
        description: "Labeling taxonomy",
      },
    });

    // Task
    writePackage(path.join(tmpDir, "tasks", "triage"), {
      name: "@test/task-triage",
      version: "1.0.0",
      chapter: {
        type: "task",
        taskType: "subagent",
        requires: {
          apps: ["@test/app-github"],
          skills: ["@test/skill-labeling"],
        },
      },
    });

    // Role — allows a tool that doesn't exist on the app
    writePackage(path.join(tmpDir, "roles", "manager"), {
      name: "@test/role-manager",
      version: "1.0.0",
      chapter: {
        type: "role",
        tasks: ["@test/task-triage"],
        skills: ["@test/skill-labeling"],
        permissions: {
          "@test/app-github": {
            allow: ["create_issue", "nonexistent_tool"],
            deny: [],
          },
        },
      },
    });

    // Agent
    writePackage(path.join(tmpDir, "agents", "ops"), {
      name: "@test/agent-ops",
      version: "1.0.0",
      chapter: {
        type: "agent",
        runtimes: ["claude-code"],
        roles: ["@test/role-manager"],
      },
    });
  }

  it("creates complete directory structure for valid agent", async () => {
    setupValidAgent();
    const outputDir = path.join(tmpDir, "output");
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: "output" });

    expect(exitSpy).not.toHaveBeenCalledWith(1);

    // Check all expected files exist
    expect(fs.existsSync(path.join(outputDir, "chapter-proxy/Dockerfile"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "claude-code/Dockerfile"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "claude-code/workspace/.claude/settings.json"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "claude-code/workspace/AGENTS.md"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "docker-compose.yml"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, ".env"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "forge.lock.json"))).toBe(true);
  });

  it("does not generate mcp-proxy config.json", async () => {
    setupValidAgent();
    const outputDir = path.join(tmpDir, "output");
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: "output" });

    expect(fs.existsSync(path.join(outputDir, "mcp-proxy/config.json"))).toBe(false);
  });

  it("generates slash commands for tasks", async () => {
    setupValidAgent();
    const outputDir = path.join(tmpDir, "output");
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: "output" });

    const commandPath = path.join(outputDir, "claude-code/workspace/.claude/commands/triage.md");
    expect(fs.existsSync(commandPath)).toBe(true);

    const content = fs.readFileSync(commandPath, "utf-8");
    expect(content).toContain("@test/task-triage");
    expect(content).toContain("manager");
  });

  it("generates .env with non-empty FORGE_PROXY_TOKEN", async () => {
    setupValidAgent();
    const outputDir = path.join(tmpDir, "output");
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: "output" });

    const envContent = fs.readFileSync(path.join(outputDir, ".env"), "utf-8");
    const tokenMatch = envContent.match(/FORGE_PROXY_TOKEN=(\S+)/);
    expect(tokenMatch).not.toBeNull();
    expect(tokenMatch![1].length).toBe(64); // 32 bytes = 64 hex chars
  });

  it("aborts with non-zero exit on validation errors", async () => {
    setupInvalidAgent();
    const outputDir = path.join(tmpDir, "output");
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: "output" });

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("validation");
    expect(errorOutput).toContain("nonexistent_tool");

    // No files should be written
    expect(fs.existsSync(outputDir)).toBe(false);
  });

  it("warns on unknown runtimes but continues", async () => {
    setupValidAgent();
    // Add an unknown runtime to the agent
    const agentPkg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, "agents", "ops", "package.json"), "utf-8"),
    );
    agentPkg.chapter.runtimes = ["claude-code", "codex"];
    fs.writeFileSync(
      path.join(tmpDir, "agents", "ops", "package.json"),
      JSON.stringify(agentPkg, null, 2),
    );

    const outputDir = path.join(tmpDir, "output");
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: "output" });

    expect(exitSpy).not.toHaveBeenCalledWith(1);

    // Should still create claude-code files
    expect(fs.existsSync(path.join(outputDir, "claude-code/Dockerfile"))).toBe(true);

    // Should warn about codex
    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("codex");
    expect(logOutput).toContain("skipping");
  });

  it("is idempotent — re-running overwrites existing files", async () => {
    setupValidAgent();
    const outputDir = path.join(tmpDir, "output");

    // First run
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: "output" });
    const firstToken = fs.readFileSync(path.join(outputDir, ".env"), "utf-8");

    // Second run
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: "output" });
    const secondToken = fs.readFileSync(path.join(outputDir, ".env"), "utf-8");

    // Both runs succeeded
    expect(exitSpy).not.toHaveBeenCalledWith(1);

    // Token should be different (new random each time)
    expect(firstToken).not.toBe(secondToken);

    // Files still exist
    expect(fs.existsSync(path.join(outputDir, "chapter-proxy/Dockerfile"))).toBe(true);
  });

  it("uses default output directory when --output-dir not specified", async () => {
    setupValidAgent();
    await runInstall(tmpDir, "@test/agent-ops", {});

    const defaultDir = path.join(tmpDir, ".forge", "agents", "ops");
    expect(fs.existsSync(path.join(defaultDir, "chapter-proxy/Dockerfile"))).toBe(true);
    expect(fs.existsSync(path.join(defaultDir, "docker-compose.yml"))).toBe(true);
  });

  it("uses custom output directory with --output-dir", async () => {
    setupValidAgent();
    const customDir = path.join(tmpDir, "custom-output");
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: customDir });

    expect(fs.existsSync(path.join(customDir, "chapter-proxy/Dockerfile"))).toBe(true);
    expect(fs.existsSync(path.join(customDir, "docker-compose.yml"))).toBe(true);
  });

  it("exits 1 when agent is not found", async () => {
    await runInstall(tmpDir, "@test/nonexistent", {});

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("Install failed");
  });

  it("generates forge.lock.json with correct structure", async () => {
    setupValidAgent();
    const outputDir = path.join(tmpDir, "output");
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: "output" });

    const lockPath = path.join(outputDir, "forge.lock.json");
    const lock = JSON.parse(fs.readFileSync(lockPath, "utf-8"));

    expect(lock.lockVersion).toBe(1);
    expect(lock.agent.name).toBe("@test/agent-ops");
    expect(lock.agent.runtimes).toContain("claude-code");
    expect(lock.roles).toHaveLength(1);
    expect(lock.roles[0].name).toBe("@test/role-manager");
    expect(lock.generatedFiles.length).toBeGreaterThan(0);
  });

  it("prints success summary on completion", async () => {
    setupValidAgent();
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: "output" });

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("installed successfully");
    expect(logOutput).toContain("claude-code");
    expect(logOutput).toContain(".env");
  });

  it("shows forge run as primary next step", async () => {
    setupValidAgent();
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: "output" });

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("forge run");
  });

  it("bakes proxy token into .mcp.json", async () => {
    setupValidAgent();
    const outputDir = path.join(tmpDir, "output");
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: "output" });

    const mcpPath = path.join(outputDir, "claude-code/workspace/.mcp.json");
    const mcp = JSON.parse(fs.readFileSync(mcpPath, "utf-8"));
    const serverKeys = Object.keys(mcp.mcpServers);
    expect(serverKeys.length).toBeGreaterThan(0);
    const authHeader = mcp.mcpServers[serverKeys[0]].headers.Authorization;

    // Should contain actual token, not the placeholder
    expect(authHeader).not.toContain("${FORGE_PROXY_TOKEN}");
    expect(authHeader).toMatch(/^Bearer [a-f0-9]{64}$/);
  });

  it("docker-compose.yml includes FORGE_PROXY_TOKEN in proxy env", async () => {
    setupValidAgent();
    const outputDir = path.join(tmpDir, "output");
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: "output" });

    const composeContent = fs.readFileSync(path.join(outputDir, "docker-compose.yml"), "utf-8");
    const proxySection = composeContent.split("claude-code:")[0];
    expect(proxySection).toContain("FORGE_PROXY_TOKEN=${FORGE_PROXY_TOKEN}");
  });

  it("generates single-stage chapter-proxy/Dockerfile with pre-built chapter", async () => {
    setupValidAgent();
    const outputDir = path.join(tmpDir, "output");
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: "output" });

    const dockerfilePath = path.join(outputDir, "chapter-proxy/Dockerfile");
    expect(fs.existsSync(dockerfilePath)).toBe(true);

    const dockerfile = fs.readFileSync(dockerfilePath, "utf-8");
    expect(dockerfile).toContain("FROM node:22-slim");
    expect(dockerfile).not.toContain("AS builder");
    expect(dockerfile).not.toContain("npm run build");
    expect(dockerfile).not.toContain("COPY --from=builder");
    expect(dockerfile).toContain("chapter.js");
    expect(dockerfile).toContain('"proxy"');
    expect(dockerfile).not.toContain("mcp-proxy");
  });

  it("docker-compose.yml uses build: ./chapter-proxy", async () => {
    setupValidAgent();
    const outputDir = path.join(tmpDir, "output");
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: "output" });

    const composeContent = fs.readFileSync(path.join(outputDir, "docker-compose.yml"), "utf-8");
    expect(composeContent).toContain("build: ./chapter-proxy");
    expect(composeContent).not.toContain("image: ghcr.io/tbxark/mcp-proxy");
  });

  it("copies pre-built chapter into chapter-proxy/chapter/ build context", async () => {
    setupValidAgent();
    const outputDir = path.join(tmpDir, "output");
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: "output" });

    // Pre-built chapter artifacts should be in the build context
    expect(fs.existsSync(path.join(outputDir, "chapter-proxy/chapter/package.json"))).toBe(true);

    // Verify source files are NOT in the build context
    const allFiles = fs.readdirSync(path.join(outputDir, "chapter-proxy/chapter"), { recursive: true }) as string[];
    const srcFiles = allFiles.filter((f) => f.toString().startsWith("src"));
    const tsconfigFiles = allFiles.filter((f) => f.toString().includes("tsconfig"));
    expect(srcFiles).toHaveLength(0);
    expect(tsconfigFiles).toHaveLength(0);
  });

  it("copies workspace directories into chapter-proxy/workspace/", async () => {
    setupValidAgent();
    const outputDir = path.join(tmpDir, "output");
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: "output" });

    // Agent workspace should be in the build context
    expect(fs.existsSync(path.join(outputDir, "chapter-proxy/workspace/agents/ops/package.json"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "chapter-proxy/workspace/apps/github/package.json"))).toBe(true);
  });

  it("Dockerfile includes DISABLE_AUTOUPDATER but not OOBE (externalized)", async () => {
    setupValidAgent();
    const outputDir = path.join(tmpDir, "output");
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: "output" });

    const dockerfile = fs.readFileSync(path.join(outputDir, "claude-code/Dockerfile"), "utf-8");
    expect(dockerfile).not.toContain("hasCompletedOnboarding");
    expect(dockerfile).toContain("DISABLE_AUTOUPDATER=1");
  });

  it("generates .claude.json with OOBE bypass alongside workspace", async () => {
    setupValidAgent();
    const outputDir = path.join(tmpDir, "output");
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: "output" });

    const claudeJsonPath = path.join(outputDir, "claude-code/.claude.json");
    expect(fs.existsSync(claudeJsonPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(claudeJsonPath, "utf-8"));
    expect(config.hasCompletedOnboarding).toBe(true);
    expect(config.projects["/home/node/workspace"].hasTrustDialogAccepted).toBe(true);
  });

  it("creates empty .claude/ directory for volume mount", async () => {
    setupValidAgent();
    const outputDir = path.join(tmpDir, "output");
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: "output" });

    const claudeDir = path.join(outputDir, "claude-code/.claude");
    expect(fs.existsSync(claudeDir)).toBe(true);
    expect(fs.statSync(claudeDir).isDirectory()).toBe(true);
  });

  it("copies node_modules chapter packages into chapter-proxy/workspace/", async () => {
    setupValidAgent();

    // Simulate a chapter-core package in node_modules that bundles a task sub-component
    const nmTaskDir = path.join(tmpDir, "node_modules", "@clawmasons", "chapter-core", "tasks", "take-notes");
    writePackage(nmTaskDir, {
      name: "@clawmasons/task-take-notes",
      version: "1.0.0",
      chapter: {
        type: "task",
        taskType: "subagent",
        prompt: "./notes.md",
        requires: {},
      },
    });
    fs.writeFileSync(path.join(nmTaskDir, "notes.md"), "Take notes prompt");

    // Add the node_modules task to the role so it's in the resolved dependency graph
    const rolePkg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, "roles", "manager", "package.json"), "utf-8"),
    );
    rolePkg.chapter.tasks.push("@clawmasons/task-take-notes");
    fs.writeFileSync(
      path.join(tmpDir, "roles", "manager", "package.json"),
      JSON.stringify(rolePkg, null, 2),
    );

    const outputDir = path.join(tmpDir, "output");
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: "output" });

    expect(exitSpy).not.toHaveBeenCalledWith(1);

    // The node_modules task should be copied into chapter-proxy/workspace/tasks/
    expect(
      fs.existsSync(path.join(outputDir, "chapter-proxy/workspace/tasks/take-notes/package.json")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(outputDir, "chapter-proxy/workspace/tasks/take-notes/notes.md")),
    ).toBe(true);

    // Local workspace packages should still be there too
    expect(
      fs.existsSync(path.join(outputDir, "chapter-proxy/workspace/agents/ops/package.json")),
    ).toBe(true);
  });

  it("does not copy non-local packages outside the resolved dependency graph", async () => {
    setupValidAgent();

    // Simulate an unrelated agent in node_modules with the same basename as our local agent
    const nmAgentDir = path.join(tmpDir, "node_modules", "@clawmasons", "chapter-core", "agents", "ops");
    writePackage(nmAgentDir, {
      name: "@clawmasons/agent-ops",
      version: "1.0.0",
      chapter: {
        type: "agent",
        runtimes: ["claude-code"],
        roles: [],
      },
    });

    const outputDir = path.join(tmpDir, "output");
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: "output" });

    expect(exitSpy).not.toHaveBeenCalledWith(1);

    // The local agent package.json should be preserved (not overwritten by the node_modules one)
    const agentPkg = JSON.parse(
      fs.readFileSync(path.join(outputDir, "chapter-proxy/workspace/agents/ops/package.json"), "utf-8"),
    );
    expect(agentPkg.name).toBe("@test/agent-ops");
    expect(agentPkg.name).not.toBe("@clawmasons/agent-ops");
  });

  it("claude-code compose service has restart no", async () => {
    setupValidAgent();
    const outputDir = path.join(tmpDir, "output");
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: "output" });

    const composeContent = fs.readFileSync(path.join(outputDir, "docker-compose.yml"), "utf-8");
    const claudeSection = composeContent.split("claude-code:")[1];
    expect(claudeSection).toContain("restart: no");
  });
});
