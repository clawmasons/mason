import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pam-install-test-"));
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
      pam: {
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
      pam: {
        type: "skill",
        artifacts: ["./SKILL.md"],
        description: "Labeling taxonomy",
      },
    });

    // Task
    writePackage(path.join(tmpDir, "tasks", "triage"), {
      name: "@test/task-triage",
      version: "1.0.0",
      pam: {
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
      pam: {
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
      pam: {
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
      pam: {
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
      pam: {
        type: "skill",
        artifacts: ["./SKILL.md"],
        description: "Labeling taxonomy",
      },
    });

    // Task
    writePackage(path.join(tmpDir, "tasks", "triage"), {
      name: "@test/task-triage",
      version: "1.0.0",
      pam: {
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
      pam: {
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
      pam: {
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
    expect(fs.existsSync(path.join(outputDir, "mcp-proxy/config.json"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "claude-code/Dockerfile"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "claude-code/workspace/.claude/settings.json"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "claude-code/workspace/AGENTS.md"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "docker-compose.yml"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, ".env"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "pam.lock.json"))).toBe(true);
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

  it("generates proxy config with correct toolFilters", async () => {
    setupValidAgent();
    const outputDir = path.join(tmpDir, "output");
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: "output" });

    const configPath = path.join(outputDir, "mcp-proxy/config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

    expect(config.mcpServers.github).toBeDefined();
    expect(config.mcpServers.github.options.toolFilter.mode).toBe("allow");
    expect(config.mcpServers.github.options.toolFilter.list).toContain("create_issue");
    expect(config.mcpServers.github.options.toolFilter.list).toContain("list_repos");
  });

  it("generates .env with non-empty PAM_PROXY_TOKEN", async () => {
    setupValidAgent();
    const outputDir = path.join(tmpDir, "output");
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: "output" });

    const envContent = fs.readFileSync(path.join(outputDir, ".env"), "utf-8");
    const tokenMatch = envContent.match(/PAM_PROXY_TOKEN=(\S+)/);
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
    agentPkg.pam.runtimes = ["claude-code", "codex"];
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
    expect(fs.existsSync(path.join(outputDir, "mcp-proxy/config.json"))).toBe(true);
  });

  it("uses default output directory when --output-dir not specified", async () => {
    setupValidAgent();
    await runInstall(tmpDir, "@test/agent-ops", {});

    const defaultDir = path.join(tmpDir, ".pam", "agents", "ops");
    expect(fs.existsSync(path.join(defaultDir, "mcp-proxy/config.json"))).toBe(true);
    expect(fs.existsSync(path.join(defaultDir, "docker-compose.yml"))).toBe(true);
  });

  it("uses custom output directory with --output-dir", async () => {
    setupValidAgent();
    const customDir = path.join(tmpDir, "custom-output");
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: customDir });

    expect(fs.existsSync(path.join(customDir, "mcp-proxy/config.json"))).toBe(true);
    expect(fs.existsSync(path.join(customDir, "docker-compose.yml"))).toBe(true);
  });

  it("exits 1 when agent is not found", async () => {
    await runInstall(tmpDir, "@test/nonexistent", {});

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("Install failed");
  });

  it("generates pam.lock.json with correct structure", async () => {
    setupValidAgent();
    const outputDir = path.join(tmpDir, "output");
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: "output" });

    const lockPath = path.join(outputDir, "pam.lock.json");
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

  it("shows pam run as primary next step", async () => {
    setupValidAgent();
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: "output" });

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("pam run");
  });

  it("bakes proxy token into settings.json", async () => {
    setupValidAgent();
    const outputDir = path.join(tmpDir, "output");
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: "output" });

    const settingsPath = path.join(outputDir, "claude-code/workspace/.claude/settings.json");
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    // Per-server entries: pick the first server (github) to check the baked token
    const serverKeys = Object.keys(settings.mcpServers);
    expect(serverKeys.length).toBeGreaterThan(0);
    const authHeader = settings.mcpServers[serverKeys[0]].headers.Authorization;

    // Should contain actual token, not the placeholder
    expect(authHeader).not.toContain("${PAM_PROXY_TOKEN}");
    expect(authHeader).toMatch(/^Bearer [a-f0-9]{64}$/);
  });

  it("docker-compose.yml includes PAM_PROXY_TOKEN in mcp-proxy env", async () => {
    setupValidAgent();
    const outputDir = path.join(tmpDir, "output");
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: "output" });

    const composeContent = fs.readFileSync(path.join(outputDir, "docker-compose.yml"), "utf-8");
    const proxySection = composeContent.split("claude-code:")[0];
    expect(proxySection).toContain("PAM_PROXY_TOKEN=${PAM_PROXY_TOKEN}");
  });

  it("generates mcp-proxy/Dockerfile when agent has stdio apps", async () => {
    setupValidAgent();
    const outputDir = path.join(tmpDir, "output");
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: "output" });

    const dockerfilePath = path.join(outputDir, "mcp-proxy/Dockerfile");
    expect(fs.existsSync(dockerfilePath)).toBe(true);

    const dockerfile = fs.readFileSync(dockerfilePath, "utf-8");
    expect(dockerfile).toContain("FROM node:22-slim");
    expect(dockerfile).toContain("COPY --from=proxy /main /usr/local/bin/mcp-proxy");
  });

  it("docker-compose.yml uses build: when stdio apps exist", async () => {
    setupValidAgent();
    const outputDir = path.join(tmpDir, "output");
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: "output" });

    const composeContent = fs.readFileSync(path.join(outputDir, "docker-compose.yml"), "utf-8");
    expect(composeContent).toContain("build: ./mcp-proxy");
    expect(composeContent).not.toContain("image: ghcr.io/tbxark/mcp-proxy:latest");
  });

  it("Dockerfile includes OOBE skip and DISABLE_AUTOUPDATER", async () => {
    setupValidAgent();
    const outputDir = path.join(tmpDir, "output");
    await runInstall(tmpDir, "@test/agent-ops", { outputDir: "output" });

    const dockerfile = fs.readFileSync(path.join(outputDir, "claude-code/Dockerfile"), "utf-8");
    expect(dockerfile).toContain("hasCompletedOnboarding");
    expect(dockerfile).toContain("DISABLE_AUTOUPDATER=1");
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

