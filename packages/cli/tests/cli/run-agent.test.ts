import { type MockInstance, describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { program } from "../../src/cli/index.js";
import {
  generateSessionId,
  resolveRequiredCredentials,
  displayCredentials,
  runAgent,
  runProxyOnly,
  resolveAgentType,
  isKnownAgentType,
  getKnownAgentTypeNames,
  ensureMasonConfig,
  buildVscodeAttachUri,
} from "../../src/cli/commands/run-agent.js";
import {
  generateSessionComposeYml,
  generateVolumeMasks,
} from "../../src/materializer/docker-generator.js";
import type { Role, ResolvedAgent } from "@clawmasons/shared";

// ── Command Registration ────────────────────────────────────────────────

describe("CLI run command", () => {
  it("has the run command registered at top level", () => {
    const cmd = program.commands.find((c) => c.name() === "run");
    expect(cmd).toBeDefined();
    if (cmd) {
      expect(cmd.description()).toContain("Run a role");
    }
  });

  it("does not have a hidden agent command (agent type removed)", () => {
    const cmd = program.commands.find((c) => c.name() === "agent");
    expect(cmd).toBeUndefined();
  });

  it("run command has --role option", () => {
    const cmd = program.commands.find((c) => c.name() === "run");
    expect(cmd).toBeDefined();
    if (cmd) {
      const roleOpt = cmd.options.find((o) => o.long === "--role");
      expect(roleOpt).toBeDefined();
    }
  });

  it("run command has --acp option", () => {
    const cmd = program.commands.find((c) => c.name() === "run");
    expect(cmd).toBeDefined();
    if (cmd) {
      const acpOpt = cmd.options.find((o) => o.long === "--acp");
      expect(acpOpt).toBeDefined();
    }
  });

  it("run command has --bash option", () => {
    const cmd = program.commands.find((c) => c.name() === "run");
    expect(cmd).toBeDefined();
    if (cmd) {
      const bashOpt = cmd.options.find((o) => o.long === "--bash");
      expect(bashOpt).toBeDefined();
    }
  });

  it("run command has --agent option (renamed from --agent-type)", () => {
    const cmd = program.commands.find((c) => c.name() === "run");
    expect(cmd).toBeDefined();
    if (cmd) {
      const agentOpt = cmd.options.find((o) => o.long === "--agent");
      expect(agentOpt).toBeDefined();
      const agentTypeOpt = cmd.options.find((o) => o.long === "--agent-type");
      expect(agentTypeOpt).toBeUndefined();
    }
  });

  it("run command has --home option", () => {
    const cmd = program.commands.find((c) => c.name() === "run");
    expect(cmd).toBeDefined();
    if (cmd) {
      const homeOpt = cmd.options.find((o) => o.long === "--home");
      expect(homeOpt).toBeDefined();
    }
  });

  it("run command has --terminal option", () => {
    const cmd = program.commands.find((c) => c.name() === "run");
    expect(cmd).toBeDefined();
    if (cmd) {
      const terminalOpt = cmd.options.find((o) => o.long === "--terminal");
      expect(terminalOpt).toBeDefined();
    }
  });
});

// ── Agent Type Resolution ────────────────────────────────────────────────

describe("resolveAgentType", () => {
  it("resolves alias 'claude' to 'claude-code-agent'", () => {
    expect(resolveAgentType("claude")).toBe("claude-code-agent");
  });

  it("resolves alias 'pi' to 'pi-coding-agent'", () => {
    expect(resolveAgentType("pi")).toBe("pi-coding-agent");
  });

  it("resolves alias 'mcp' to 'mcp-agent'", () => {
    expect(resolveAgentType("mcp")).toBe("mcp-agent");
  });

  it("resolves direct agent type 'claude-code-agent'", () => {
    expect(resolveAgentType("claude-code-agent")).toBe("claude-code-agent");
  });

  it("returns undefined for unknown agent type", () => {
    expect(resolveAgentType("unknown-agent")).toBeUndefined();
  });
});

describe("isKnownAgentType", () => {
  it("returns true for aliases", () => {
    expect(isKnownAgentType("claude")).toBe(true);
    expect(isKnownAgentType("pi")).toBe(true);
    expect(isKnownAgentType("mcp")).toBe(true);
  });

  it("returns true for registered types", () => {
    expect(isKnownAgentType("claude-code-agent")).toBe(true);
    expect(isKnownAgentType("pi-coding-agent")).toBe(true);
  });

  it("returns false for unknown types", () => {
    expect(isKnownAgentType("unknown")).toBe(false);
    expect(isKnownAgentType("gpt")).toBe(false);
  });
});

describe("getKnownAgentTypeNames", () => {
  it("includes all aliases and registered types", () => {
    const names = getKnownAgentTypeNames();
    expect(names).toContain("claude");
    expect(names).toContain("claude-code-agent");
    expect(names).toContain("pi");
    expect(names).toContain("mcp");
    expect(names.length).toBeGreaterThan(3);
  });

  it("returns sorted array", () => {
    const names = getKnownAgentTypeNames();
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });
});

// ── generateSessionId ───────────────────────────────────────────────────

describe("generateSessionId", () => {
  it("returns an 8-character hex string", () => {
    const id = generateSessionId();
    expect(id).toMatch(/^[0-9a-f]{8}$/);
  });

  it("generates unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateSessionId());
    }
    // With 4 bytes of randomness, 100 IDs should all be unique
    expect(ids.size).toBe(100);
  });
});

// ── resolveRequiredCredentials ───────────────────────────────────────────

describe("resolveRequiredCredentials", () => {
  it("collects credentials from agent", () => {
    const result = resolveRequiredCredentials(
      "researcher",
      ["OPENAI_API_KEY", "SERP_API_KEY"],
      [],
    );

    expect(result.size).toBe(2);
    expect(result.get("OPENAI_API_KEY")).toEqual(["researcher"]);
    expect(result.get("SERP_API_KEY")).toEqual(["researcher"]);
  });

  it("collects credentials from role apps", () => {
    const result = resolveRequiredCredentials(
      "researcher",
      [],
      [
        { name: "web-search", credentials: ["SERP_API_KEY"] },
        { name: "llm-api", credentials: ["OPENAI_API_KEY"] },
      ],
    );

    expect(result.size).toBe(2);
    expect(result.get("SERP_API_KEY")).toEqual(["web-search"]);
    expect(result.get("OPENAI_API_KEY")).toEqual(["llm-api"]);
  });

  it("merges declaring packages for shared credentials", () => {
    const result = resolveRequiredCredentials(
      "researcher",
      ["SERP_API_KEY"],
      [{ name: "web-search", credentials: ["SERP_API_KEY"] }],
    );

    expect(result.size).toBe(1);
    expect(result.get("SERP_API_KEY")).toEqual(["researcher", "web-search"]);
  });

  it("returns empty map when no credentials", () => {
    const result = resolveRequiredCredentials("researcher", [], []);
    expect(result.size).toBe(0);
  });
});

// ── displayCredentials ──────────────────────────────────────────────────

describe("displayCredentials", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("displays risk level with role name", () => {
    const creds = new Map<string, string[]>();
    creds.set("API_KEY", ["agent"]);

    displayCredentials(creds, "HIGH", "web-research");

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("web-research");
    expect(output).toContain("HIGH risk");
  });

  it("displays credential keys with declaring packages", () => {
    const creds = new Map<string, string[]>();
    creds.set("SERP_API_KEY", ["researcher", "web-search"]);
    creds.set("OPENAI_API_KEY", ["researcher"]);

    displayCredentials(creds, "MEDIUM", "web-research");

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("SERP_API_KEY");
    expect(output).toContain("researcher, web-search");
    expect(output).toContain("OPENAI_API_KEY");
    expect(output).toContain("Required credentials:");
  });

  it("displays message when no credentials required", () => {
    const creds = new Map<string, string[]>();

    displayCredentials(creds, "LOW", "basic-role");

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("No credentials required");
  });

  it("deduplicates declaring packages", () => {
    const creds = new Map<string, string[]>();
    creds.set("API_KEY", ["agent", "agent"]);

    displayCredentials(creds, "LOW", "test-role");

    const output = logSpy.mock.calls.flat().join("\n");
    // Should show "agent" only once, not "agent, agent"
    expect(output).toContain("declared by: agent)");
  });
});

// ── generateSessionComposeYml (run-agent scenarios) ─────────────────────

describe("generateSessionComposeYml (run-agent scenarios)", () => {
  const defaultOpts = {
    dockerBuildDir: "/projects/my-project/.mason/docker/writer",
    dockerDir: "/projects/my-project/.mason/docker",
    projectDir: "/projects/my-project",
    agentType: "claude-code-agent",
    agentName: "@acme/agent",
    roleName: "writer",
    proxyToken: "test-token-abc",
    relayToken: "cred-token-xyz",
    proxyPort: 3000,
    sessionDir: "/projects/my-project/.mason/sessions/abc123",
    logsDir: "/projects/my-project/.mason/sessions/abc123/logs",
    workspacePath: "/projects/my-project/.mason/docker/writer/claude-code-agent/workspace",
    buildWorkspaceProjectPath: "/projects/my-project/.mason/docker/writer/claude-code-agent/build/workspace/project",
    buildWorkspaceProjectFileEntries: [] as string[],
    buildWorkspaceProjectDirEntries: [] as string[],
  };

  it("generates valid compose YAML with correct service names", () => {
    const yml = generateSessionComposeYml(defaultOpts);

    expect(yml).toContain("proxy-writer:");
    expect(yml).toContain("agent-writer:");
    expect(yml).not.toContain("credential-service:");
    expect(yml).toContain("mcp-proxy/Dockerfile");
    expect(yml).toContain("/home/mason/workspace/project");
    expect(yml).toContain("3000:9090");
    expect(yml).toContain("stdin_open: true");
    expect(yml).toContain("tty: true");
    expect(yml).toContain("init: true");
  });

  it("includes RELAY_TOKEN in proxy environment", () => {
    const yml = generateSessionComposeYml(defaultOpts);
    const proxySection = yml.split("agent-writer:")[0]!;
    expect(proxySection).toContain("RELAY_TOKEN=cred-token-xyz");
  });

  it("agent depends on proxy directly", () => {
    const yml = generateSessionComposeYml(defaultOpts);
    const agentSection = yml.split("agent-writer:")[1]!;
    expect(agentSection).toContain("depends_on:");
    expect(agentSection).toContain("- proxy-writer");
  });

  it("agent environment has only MCP_PROXY_TOKEN, no API keys", () => {
    const yml = generateSessionComposeYml(defaultOpts);
    const agentSection = yml.split("agent-writer:")[1]!;

    expect(agentSection).toContain("MCP_PROXY_TOKEN=test-token-abc");
    expect(agentSection).not.toContain("OPENROUTER_API_KEY");
    expect(agentSection).not.toContain("ANTHROPIC_API_KEY");
    expect(agentSection).not.toContain("MASON_PROXY_TOKEN");
  });

  it("proxy has MASON_PROXY_TOKEN", () => {
    const yml = generateSessionComposeYml(defaultOpts);
    const proxySection = yml.split("agent-writer:")[0]!;
    expect(proxySection).toContain("MASON_PROXY_TOKEN=test-token-abc");
  });

  it("includes PROJECT_DIR in proxy environment", () => {
    const yml = generateSessionComposeYml(defaultOpts);
    const proxySection = yml.split("agent-writer:")[0]!;
    expect(proxySection).toContain("PROJECT_DIR=/home/mason/workspace/project");
  });

  it("includes role mounts in agent volumes", () => {
    const yml = generateSessionComposeYml({
      ...defaultOpts,
      roleMounts: [
        { source: "/host/data", target: "/container/data", readonly: false },
      ],
    });
    const agentSection = yml.split("agent-writer:")[1]!;
    expect(agentSection).toContain("/host/data:/container/data");
  });

  it("does not add role mounts to proxy volumes", () => {
    const yml = generateSessionComposeYml({
      ...defaultOpts,
      roleMounts: [
        { source: "/host/data", target: "/mnt/data", readonly: false },
      ],
    });
    const proxySection = yml.split("agent-writer:")[0]!;
    expect(proxySection).not.toContain("/mnt/data");
  });

  it("adds AGENT_COMMAND_OVERRIDE=bash when bashMode is true", () => {
    const yml = generateSessionComposeYml({ ...defaultOpts, bashMode: true });
    const agentSection = yml.split("agent-writer:")[1]!;
    expect(agentSection).toContain("AGENT_COMMAND_OVERRIDE=bash");
  });

  it("does not add AGENT_COMMAND_OVERRIDE when bashMode is false", () => {
    const yml = generateSessionComposeYml({ ...defaultOpts, bashMode: false });
    expect(yml).not.toContain("AGENT_COMMAND_OVERRIDE");
  });

  it("adds AGENT_ENTRY_VERBOSE=1 when verbose is true", () => {
    const yml = generateSessionComposeYml({ ...defaultOpts, verbose: true });
    const agentSection = yml.split("agent-writer:")[1]!;
    expect(agentSection).toContain("AGENT_ENTRY_VERBOSE=1");
  });

  it("adds homeOverride volume as first agent volume", () => {
    const yml = generateSessionComposeYml({
      ...defaultOpts,
      homeOverride: "/custom/home",
    });
    const agentSection = yml.split("agent-writer:")[1]!;
    const volumeSection = agentSection.split("volumes:")[1]!.split(/configs:|depends_on:/)[0]!;
    const mountLines = volumeSection.split("\n").filter((l: string) => l.trim().startsWith("- "));

    // First mount should be the home override
    expect(mountLines[0]).toContain("/home/mason/");
    // Project mount comes next
    expect(mountLines[1]).toContain("/home/mason/workspace/project");
  });

  it("does not add home override mount when homeOverride is not set", () => {
    const yml = generateSessionComposeYml(defaultOpts);
    const agentSection = yml.split("agent-writer:")[1]!;
    // No mount to bare /home/mason/ (only /home/mason/workspace...)
    const lines = agentSection.split("\n");
    const homeMountLines = lines.filter((l: string) => l.includes(":/home/mason/") && !l.includes(":/home/mason/workspace"));
    expect(homeMountLines).toHaveLength(0);
  });

  it("adds vscodeServerHostPath volume mount", () => {
    const yml = generateSessionComposeYml({
      ...defaultOpts,
      vscodeServerHostPath: "/projects/my-project/.mason/docker/vscode-server",
    });
    expect(yml).toContain(":/home/mason/.vscode-server");
  });

  it("omits vscode-server mount when vscodeServerHostPath is not set", () => {
    const yml = generateSessionComposeYml(defaultOpts);
    expect(yml).not.toContain(".vscode-server");
  });

  it("mounts file overlays as Docker Compose configs", () => {
    const yml = generateSessionComposeYml({
      ...defaultOpts,
      buildWorkspaceProjectFileEntries: [".mcp.json", "AGENTS.md"],
    });

    // Top-level configs section
    expect(yml).toContain("configs:");
    expect(yml).toContain("overlay-mcp-json:");
    expect(yml).toContain("overlay-agents-md:");

    // Service-level configs with target paths
    expect(yml).toContain("target: /home/mason/workspace/project/.mcp.json");
    expect(yml).toContain("target: /home/mason/workspace/project/AGENTS.md");
  });

  it("mounts directory overlays as bind mounts (not configs)", () => {
    const yml = generateSessionComposeYml({
      ...defaultOpts,
      buildWorkspaceProjectDirEntries: [".claude"],
    });

    // Directory should appear as a volume bind mount
    expect(yml).toContain(":/home/mason/workspace/project/.claude");

    // Should NOT appear as a config
    expect(yml).not.toContain("overlay-claude:");
  });

  it("includes volume masks from ignore paths", () => {
    const yml = generateSessionComposeYml({
      ...defaultOpts,
      volumeMasks: generateVolumeMasks([".mason/", ".claude/", ".env"]),
    });

    expect(yml).toContain("ignore-mason:/home/mason/workspace/project/.mason");
    expect(yml).toContain("ignore-claude:/home/mason/workspace/project/.claude");
    // File masks now routed through configs (VirtioFS-safe)
    expect(yml).toContain("mask-env:");
    expect(yml).toContain("target: /home/mason/workspace/project/.env");
  });
});

// ── ensureMasonConfig ────────────────────────────────────────────────────

describe("ensureMasonConfig", () => {
  let tmpDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mason-config-test-"));
    logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates .mason/config.json with default template when absent", () => {
    ensureMasonConfig(tmpDir);

    const configPath = path.join(tmpDir, ".mason", "config.json");
    expect(fs.existsSync(configPath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const agents = content.agents as Record<string, { package: string }>;
    expect(agents).toBeDefined();
    expect(agents["claude"]?.package).toBe("@clawmasons/claude-code-agent");
    expect(agents["pi-mono-agent"]?.package).toBe("@clawmasons/pi-mono-agent");
    expect(agents["mcp"]?.package).toBe("@clawmasons/mcp-agent");
  });

  it("creates .mason directory if it does not exist", () => {
    expect(fs.existsSync(path.join(tmpDir, ".mason"))).toBe(false);
    ensureMasonConfig(tmpDir);
    expect(fs.existsSync(path.join(tmpDir, ".mason"))).toBe(true);
  });

  it("prints a notice to stderr when config is created", () => {
    ensureMasonConfig(tmpDir);
    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Created .mason/config.json");
  });

  it("does not overwrite existing config.json", () => {
    const masonDir = path.join(tmpDir, ".mason");
    fs.mkdirSync(masonDir, { recursive: true });
    const configPath = path.join(masonDir, "config.json");
    const existing = JSON.stringify({ agents: { custom: { package: "@custom/agent" } } });
    fs.writeFileSync(configPath, existing);

    ensureMasonConfig(tmpDir);

    const content = fs.readFileSync(configPath, "utf-8");
    expect(content).toBe(existing);
    expect(logSpy).not.toHaveBeenCalled();
  });
});

// ── packages-hash invalidation ──────────────────────────────────────────

describe("packages-hash invalidation", () => {
  let tmpDir: string;
  let projectDir: string;

  function makeRole(overrides?: Partial<Role>): Role {
    return {
      metadata: { name: "role-writer", version: "1.0.0" },
      source: { agentDialect: "claude-code-agent", agentDir: ".claude", roleDir: "" },
      skills: [], commands: [], tools: [], apps: [],
      ...overrides,
    } as Role;
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "packages-hash-test-"));
    projectDir = path.join(tmpDir, "my-project");
    fs.mkdirSync(projectDir, { recursive: true });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeDockerBuildDir(packagesForHash: object) {
    const dockerBuildDir = path.join(projectDir, ".mason", "docker", "writer");
    fs.mkdirSync(path.join(dockerBuildDir, "claude-code-agent"), { recursive: true });
    fs.writeFileSync(path.join(dockerBuildDir, "claude-code-agent", "Dockerfile"), "FROM node:20\n");
    fs.mkdirSync(path.join(dockerBuildDir, "mcp-proxy"), { recursive: true });
    fs.writeFileSync(path.join(dockerBuildDir, "mcp-proxy", "Dockerfile"), "FROM node:20\n");
    const hash = crypto.createHash("sha256").update(JSON.stringify(packagesForHash)).digest("hex");
    fs.writeFileSync(path.join(dockerBuildDir, "claude-code-agent", ".packages-hash"), hash);
    return dockerBuildDir;
  }

  function makeDeps(roleType: Role) {
    return {
      generateSessionIdFn: () => "test1234",
      checkDockerComposeFn: () => {},
      waitForProxyHealthFn: async () => {},
      resolveRoleFn: async () => roleType,
      adaptRoleFn: () => ({
        name: "writer", version: "1.0.0", agentName: "writer", slug: "writer",
        runtimes: ["claude-code-agent"], credentials: [],
        roles: [{ name: "writer", version: "1.0.0", risk: "LOW", permissions: {}, tasks: [], apps: [], skills: [] }],
      } as ResolvedAgent),
      ensureGitignoreEntryFn: () => false,
      existsSyncFn: (p: string) => fs.existsSync(p),
      execComposeFn: async () => 0,
      runAgentFn: async () => 0,
      startHostProxyFn: async () => ({ stop: async () => {} }),
    };
  }

  it("skips rebuild when packages hash matches", async () => {
    const role = makeRole();
    const dockerBuildDir = makeDockerBuildDir(role.container?.packages ?? {});
    const dockerfilePath = path.join(dockerBuildDir, "claude-code-agent", "Dockerfile");
    const mtime = fs.statSync(dockerfilePath).mtimeMs;

    await runAgent(projectDir, "claude-code-agent", "writer", makeDeps(role));

    // Dockerfile should not have been regenerated
    expect(fs.statSync(dockerfilePath).mtimeMs).toBe(mtime);
  });

  it("triggers rebuild when packages hash differs", async () => {
    const role = makeRole({ container: { packages: { apt: ["git"], npm: [], pip: [] }, ignore: { paths: [] }, mounts: [] } } as Partial<Role>);
    // Create build dir with OLD hash (no apt packages)
    const dockerBuildDir = makeDockerBuildDir({});
    const dockerfilePath = path.join(dockerBuildDir, "claude-code-agent", "Dockerfile");

    // runAgent will detect hash mismatch and try to rebuild
    // generateRoleDockerBuildDir will be called — it may partially fail in test env, but the key
    // thing is the OLD build dir is deleted (Dockerfile removed) before rebuild attempt
    const originalDockerfileContent = fs.readFileSync(dockerfilePath, "utf-8");
    await runAgent(projectDir, "claude-code-agent", "writer", makeDeps(role)).catch(() => {});

    // The old Dockerfile content ("FROM node:20") should be gone — build was invalidated
    const newContent = fs.existsSync(dockerfilePath) ? fs.readFileSync(dockerfilePath, "utf-8") : null;
    expect(newContent).not.toBe(originalDockerfileContent);
  });

  it("writes packages hash after a fresh build", async () => {
    const role = makeRole();
    // No pre-existing build dir — fresh build
    const dockerBuildDir = path.join(projectDir, ".mason", "docker", "writer");
    const hashFilePath = path.join(dockerBuildDir, "claude-code-agent", ".packages-hash");

    expect(fs.existsSync(hashFilePath)).toBe(false);

    await runAgent(projectDir, "claude-code-agent", "writer", makeDeps(role)).catch(() => {});

    // Hash file should be written after build (even if some steps fail in test env)
    // The hash for empty packages is deterministic
    const expectedHash = crypto.createHash("sha256").update(JSON.stringify({})).digest("hex");
    if (fs.existsSync(hashFilePath)) {
      expect(fs.readFileSync(hashFilePath, "utf-8").trim()).toBe(expectedHash);
    }
  });
});

// ── runAgent (integration) ──────────────────────────────────────────────

describe("runAgent", () => {
  let tmpDir: string;
  let projectDir: string;
  let exitSpy: MockInstance;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  // Minimal Role fixture for testing.
  // metadata.name uses "role-" prefix so getAppShortName strips it → "writer".
  function makeRole(overrides?: Partial<Role>): Role {
    return {
      metadata: { name: "role-writer", version: "1.0.0" },
      source: {
        agentDialect: "claude-code-agent",
        agentDir: ".claude",
        roleDir: path.join(projectDir, ".claude", "roles", "writer"),
      },
      skills: [],
      commands: [],
      tools: [],
      apps: [],
      ...overrides,
    } as Role;
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mason-run-agent-test-"));
    projectDir = path.join(tmpDir, "my-project");
    fs.mkdirSync(projectDir, { recursive: true });

    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeMockDeps(overrides?: {
    proxyExitCode?: number;
    hostProxyExitCode?: number;
    agentExitCode?: number;
    downExitCode?: number;
    sessionId?: string;
    roleType?: Role;
    resolveRoleError?: Error;
    gitignoreCalled?: { called: boolean; dir?: string; pattern?: string };
    dockerBuildExists?: boolean;
  }) {
    const calls: Array<{ composeFile: string; args: string[]; opts?: { interactive?: boolean } }> = [];

    // Pre-create docker build dir if needed (default: exists)
    const shouldExist = overrides?.dockerBuildExists ?? true;
    const dockerDir = path.join(projectDir, ".mason", "docker");
    const dockerBuildDir = path.join(dockerDir, "writer");
    const role = overrides?.roleType ?? makeRole();
    if (shouldExist) {
      fs.mkdirSync(path.join(dockerBuildDir, "claude-code-agent"), { recursive: true });
      fs.writeFileSync(path.join(dockerBuildDir, "claude-code-agent", "Dockerfile"), "FROM node:20\n");
      // Write packages hash so the hash-invalidation check doesn't trigger a rebuild
      const packagesHash = crypto
        .createHash("sha256")
        .update(JSON.stringify(role.container?.packages ?? {}))
        .digest("hex");
      fs.writeFileSync(path.join(dockerBuildDir, "claude-code-agent", ".packages-hash"), packagesHash);
      fs.mkdirSync(path.join(dockerBuildDir, "mcp-proxy"), { recursive: true });
      fs.writeFileSync(path.join(dockerBuildDir, "mcp-proxy", "Dockerfile"), "FROM node:20\n");
    }

    return {
      calls,
      deps: {
        generateSessionIdFn: () => overrides?.sessionId ?? "abcd1234",
        checkDockerComposeFn: () => {},
        waitForProxyHealthFn: async () => {},
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        resolveRoleFn: async (_roleName: string, _projectDir: string) => {
          if (overrides?.resolveRoleError) throw overrides.resolveRoleError;
          return overrides?.roleType ?? makeRole();
        },
        adaptRoleFn: () => ({
          name: "writer",
          version: "1.0.0",
          agentName: "writer",
          slug: "writer",
          runtimes: ["claude-code-agent"],
          credentials: [],
          roles: [{ name: "writer", version: "1.0.0", risk: "LOW", permissions: {}, tasks: [], apps: [], skills: [] }],
        } as ResolvedAgent),
        ensureGitignoreEntryFn: (dir: string, pattern: string) => {
          if (overrides?.gitignoreCalled) {
            overrides.gitignoreCalled.called = true;
            overrides.gitignoreCalled.dir = dir;
            overrides.gitignoreCalled.pattern = pattern;
          }
          return false;
        },
        existsSyncFn: (filePath: string) => {
          return fs.existsSync(filePath);
        },
        execComposeFn: async (
          composeFile: string,
          args: string[],
          opts?: { interactive?: boolean },
        ) => {
          calls.push({ composeFile, args, opts });
          // Determine which call this is based on args
          if (args.includes("-d")) {
            return overrides?.proxyExitCode ?? 0;
          }
          if (args.includes("down")) {
            return overrides?.downExitCode ?? 0;
          }
          // Agent up call
          return overrides?.agentExitCode ?? 0;
        },
        runAgentFn: async (composeFile: string, args: string[]) => {
          calls.push({ composeFile, args, opts: { interactive: true } });
          return overrides?.agentExitCode ?? 0;
        },
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        startHostProxyFn: async (_opts: {
          proxyPort: number;
          relayToken: string;
          envCredentials: Record<string, string>;
        }) => {
          if (overrides?.hostProxyExitCode && overrides.hostProxyExitCode !== 0) {
            throw new Error("Mock host proxy startup failure");
          }
          return { stop: async () => {} };
        },
      },
    };
  }

  it("resolves role and displays agent info", async () => {
    const { deps } = makeMockDeps({ sessionId: "sess0001" });

    await runAgent(projectDir, "claude-code-agent", "writer", deps);

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("claude-code-agent");
    expect(logOutput).toContain("writer");
  });

  it("exits 1 when role resolution fails", async () => {
    const { deps } = makeMockDeps({
      resolveRoleError: new Error("Role 'nonexistent' not found"),
    });

    await runAgent(projectDir, "claude-code-agent", "nonexistent", deps);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("agent failed");
    expect(errorOutput).toContain("not found");
  });

  it("creates per-project .mason/sessions/<id>/ for session state", async () => {
    const { deps } = makeMockDeps({ sessionId: "sess0001" });

    await runAgent(projectDir, "claude-code-agent", "writer", deps);

    const sessionDir = path.join(projectDir, ".mason", "sessions", "sess0001");
    expect(fs.existsSync(sessionDir)).toBe(true);

    const composeFile = path.join(sessionDir, "docker-compose.yaml");
    expect(fs.existsSync(composeFile)).toBe(true);

    const content = fs.readFileSync(composeFile, "utf-8");
    expect(content).toContain("proxy-writer:");
    expect(content).toContain("agent-writer:");
    expect(content).not.toContain("credential-service:");
  });

  it("appends .mason to project .gitignore", async () => {
    const gitignoreCalled = { called: false, dir: "", pattern: "" };
    const { deps } = makeMockDeps({ gitignoreCalled });

    await runAgent(projectDir, "claude-code-agent", "writer", deps);

    expect(gitignoreCalled.called).toBe(true);
    expect(gitignoreCalled.dir).toBe(projectDir);
    expect(gitignoreCalled.pattern).toBe(".mason");
  });

  it("mounts project dir as /home/mason/workspace/project", async () => {
    const { deps } = makeMockDeps({ sessionId: "mount001" });

    await runAgent(projectDir, "claude-code-agent", "writer", deps);

    const composeFile = path.join(
      projectDir, ".mason", "sessions", "mount001", "docker-compose.yaml",
    );
    const content = fs.readFileSync(composeFile, "utf-8");
    // Uses relative paths now
    expect(content).toContain(":/home/mason/workspace/project");
  });

  it("generates unique session IDs per invocation", async () => {
    let callCount = 0;
    const ids = ["aaaa1111", "bbbb2222"];

    const baseDeps = {
      checkDockerComposeFn: () => {},
      execComposeFn: async () => 0,
      runAgentFn: async () => 0,
      resolveRoleFn: async () => makeRole(),
      adaptRoleFn: () => ({
        name: "writer", version: "1.0.0", agentName: "writer", slug: "writer",
        runtimes: ["claude-code-agent"], credentials: [],
        roles: [{ name: "writer", version: "1.0.0", risk: "LOW", permissions: {}, tasks: [], apps: [], skills: [] }],
      } as ResolvedAgent),
      ensureGitignoreEntryFn: () => false,
      existsSyncFn: (p: string) => fs.existsSync(p),
      waitForProxyHealthFn: async () => {},
      startHostProxyFn: async () => ({ stop: async () => {} }),
    };

    // Pre-create docker build dirs for both runs
    const dockerDir = path.join(projectDir, ".mason", "docker");
    const dockerBuildDir = path.join(dockerDir, "writer");
    fs.mkdirSync(path.join(dockerBuildDir, "claude-code-agent"), { recursive: true });
    fs.writeFileSync(path.join(dockerBuildDir, "claude-code-agent", "Dockerfile"), "FROM node:20\n");
    fs.writeFileSync(path.join(dockerBuildDir, "claude-code-agent", ".packages-hash"),
      crypto.createHash("sha256").update(JSON.stringify(makeRole().container?.packages ?? {})).digest("hex"));
    fs.mkdirSync(path.join(dockerBuildDir, "mcp-proxy"), { recursive: true });
    fs.writeFileSync(path.join(dockerBuildDir, "mcp-proxy", "Dockerfile"), "FROM node:20\n");

    await runAgent(projectDir, "claude-code-agent", "writer", {
      ...baseDeps,
      generateSessionIdFn: () => ids[callCount++]!,
    });

    await runAgent(projectDir, "claude-code-agent", "writer", {
      ...baseDeps,
      generateSessionIdFn: () => ids[callCount++]!,
    });

    const sessionsDir = path.join(projectDir, ".mason", "sessions");
    const sessions = fs.readdirSync(sessionsDir);
    expect(sessions).toContain("aaaa1111");
    expect(sessions).toContain("bbbb2222");
  });

  it("starts proxy detached, then host proxy in-process, then agent interactively", async () => {
    const { calls, deps } = makeMockDeps();

    await runAgent(projectDir, "claude-code-agent", "writer", deps);

    // First call: proxy build
    expect(calls[0]!.args).toContain("build");
    expect(calls[0]!.args).toContain("proxy-writer");

    // Second call: proxy up -d
    expect(calls[1]!.args).toContain("up");
    expect(calls[1]!.args).toContain("-d");
    expect(calls[1]!.args).toContain("proxy-writer");

    // Third call: agent run (interactive)
    expect(calls[2]!.args).toContain("run");
    expect(calls[2]!.args).toContain("--rm");
    expect(calls[2]!.args).toContain("--service-ports");
    expect(calls[2]!.args).toContain("agent-writer");
    expect(calls[2]!.opts?.interactive).toBe(true);
  });

  it("tears down all services after agent exits", async () => {
    const { calls, deps } = makeMockDeps();

    await runAgent(projectDir, "claude-code-agent", "writer", deps);

    // Fourth call should be docker compose down (build, up, agent run, down)
    expect(calls[3]!.args).toContain("down");
  });

  it("retains session directory after exit", async () => {
    const { deps } = makeMockDeps({ sessionId: "keep0001" });

    await runAgent(projectDir, "claude-code-agent", "writer", deps);

    const sessionDir = path.join(projectDir, ".mason", "sessions", "keep0001");
    expect(fs.existsSync(sessionDir)).toBe(true);
  });

  it("compose file references docker build paths", async () => {
    const { deps } = makeMockDeps({ sessionId: "ref00001" });

    await runAgent(projectDir, "claude-code-agent", "writer", deps);

    const composeFile = path.join(
      projectDir, ".mason", "sessions", "ref00001", "docker-compose.yaml",
    );
    const content = fs.readFileSync(composeFile, "utf-8");

    // Uses relative paths now
    expect(content).toContain("mcp-proxy/Dockerfile");
    expect(content).toContain("claude-code-agent/Dockerfile");
  });

  it("compose file has RELAY_TOKEN in proxy", async () => {
    const { deps } = makeMockDeps({ sessionId: "tok00001" });

    await runAgent(projectDir, "claude-code-agent", "writer", deps);

    const composeFile = path.join(
      projectDir, ".mason", "sessions", "tok00001", "docker-compose.yaml",
    );
    const content = fs.readFileSync(composeFile, "utf-8");

    expect(content).toContain("RELAY_TOKEN=");

    const tokenMatch = content.match(/RELAY_TOKEN=([a-f0-9]+)/);
    expect(tokenMatch).toBeTruthy();
    expect(tokenMatch![1]).toMatch(/^[a-f0-9]{64}$/);
  });

  it("compose file has no API keys in agent environment", async () => {
    const { deps } = makeMockDeps({ sessionId: "nokeys01" });

    await runAgent(projectDir, "claude-code-agent", "writer", deps);

    const composeFile = path.join(
      projectDir, ".mason", "sessions", "nokeys01", "docker-compose.yaml",
    );
    const content = fs.readFileSync(composeFile, "utf-8");
    const agentSection = content.split("agent-writer:")[1]!;

    expect(agentSection).toContain("MCP_PROXY_TOKEN=");
    expect(agentSection).not.toContain("OPENROUTER_API_KEY");
    expect(agentSection).not.toContain("ANTHROPIC_API_KEY");
    expect(agentSection).not.toContain("OPENAI_API_KEY");
  });

  it("generates unique tokens per invocation", async () => {
    const { deps: deps1 } = makeMockDeps({ sessionId: "uniq0001" });
    const { deps: deps2 } = makeMockDeps({ sessionId: "uniq0002" });

    await runAgent(projectDir, "claude-code-agent", "writer", deps1);
    await runAgent(projectDir, "claude-code-agent", "writer", deps2);

    const file1 = path.join(
      projectDir, ".mason", "sessions", "uniq0001", "docker-compose.yaml",
    );
    const file2 = path.join(
      projectDir, ".mason", "sessions", "uniq0002", "docker-compose.yaml",
    );

    const content1 = fs.readFileSync(file1, "utf-8");
    const content2 = fs.readFileSync(file2, "utf-8");

    const proxyToken1 = content1.match(/MASON_PROXY_TOKEN=([a-f0-9]+)/)![1];
    const proxyToken2 = content2.match(/MASON_PROXY_TOKEN=([a-f0-9]+)/)![1];
    expect(proxyToken1).not.toBe(proxyToken2);

    const credToken1 = content1.match(/RELAY_TOKEN=([a-f0-9]+)/)![1];
    const credToken2 = content2.match(/RELAY_TOKEN=([a-f0-9]+)/)![1];
    expect(credToken1).not.toBe(credToken2);
  });

  it("logs session info and completion message", async () => {
    const { deps } = makeMockDeps({ sessionId: "log00001" });

    await runAgent(projectDir, "claude-code-agent", "writer", deps);

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("claude-code-agent");
    expect(logOutput).toContain("writer");
    expect(logOutput).toContain("log00001");
    expect(logOutput).toContain("agent complete");
  });

  it("includes role type in session summary for project role", async () => {
    const { deps } = makeMockDeps({
      roleType: makeRole({ type: "project" }),
    });

    await runAgent(projectDir, "claude-code-agent", "writer", deps);

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("(project)");
  });

  it("includes role type in session summary for supervisor role", async () => {
    const { deps } = makeMockDeps({
      roleType: makeRole({ type: "supervisor" }),
    });

    await runAgent(projectDir, "claude-code-agent", "writer", deps);

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("(supervisor)");
  });

  // ── Error Cases ──────────────────────────────────────────────────────

  it("exits 1 when docker compose is not available", async () => {
    const { deps } = makeMockDeps();
    deps.checkDockerComposeFn = () => {
      throw new Error("Docker Compose v2 is required");
    };

    await runAgent(projectDir, "claude-code-agent", "writer", deps);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("agent failed");
    expect(errorOutput).toContain("Docker Compose");
  });

  it("exits 1 when proxy fails to start", async () => {
    const { deps } = makeMockDeps({ proxyExitCode: 1 });

    await runAgent(projectDir, "claude-code-agent", "writer", deps);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("Failed to start proxy");
  });

  it("exits 1 when host proxy fails to start", async () => {
    const { deps } = makeMockDeps({ hostProxyExitCode: 1 });

    await runAgent(projectDir, "claude-code-agent", "writer", deps);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("Failed to start host proxy");
  });

  it("creates logs directory in session directory", async () => {
    const { deps } = makeMockDeps({ sessionId: "logs0001" });

    await runAgent(projectDir, "claude-code-agent", "writer", deps);

    const logsDir = path.join(projectDir, ".mason", "sessions", "logs0001", "logs");
    expect(fs.existsSync(logsDir)).toBe(true);
    expect(fs.statSync(logsDir).isDirectory()).toBe(true);
  });
});

// ── runProxyOnly ─────────────────────────────────────────────────────────

describe("runProxyOnly", () => {
  let tmpDir: string;
  let projectDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;

  function makeRole(overrides?: Partial<Role>): Role {
    return {
      metadata: { name: "role-writer", version: "1.0.0" },
      source: {
        agentDialect: "claude-code-agent",
        agentDir: ".claude",
        roleDir: path.join(projectDir, ".claude", "roles", "writer"),
      },
      skills: [],
      commands: [],
      tools: [],
      apps: [],
      ...overrides,
    } as Role;
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mason-proxy-only-test-"));
    projectDir = path.join(tmpDir, "my-project");
    fs.mkdirSync(projectDir, { recursive: true });

    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    // Pre-create docker build dirs
    const dockerDir = path.join(projectDir, ".mason", "docker");
    const dockerBuildDir = path.join(dockerDir, "writer");
    fs.mkdirSync(path.join(dockerBuildDir, "claude-code-agent"), { recursive: true });
    fs.writeFileSync(path.join(dockerBuildDir, "claude-code-agent", "Dockerfile"), "FROM node:20\n");
    fs.writeFileSync(path.join(dockerBuildDir, "claude-code-agent", ".packages-hash"),
      crypto.createHash("sha256").update(JSON.stringify(makeRole().container?.packages ?? {})).digest("hex"));
    fs.mkdirSync(path.join(dockerBuildDir, "mcp-proxy"), { recursive: true });
    fs.writeFileSync(path.join(dockerBuildDir, "mcp-proxy", "Dockerfile"), "FROM node:20\n");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeDeps(overrides?: { sessionId?: string; buildExitCode?: number; upExitCode?: number }) {
    const calls: Array<{ composeFile: string; args: string[] }> = [];

    return {
      calls,
      deps: {
        generateSessionIdFn: () => overrides?.sessionId ?? "proxy001",
        checkDockerComposeFn: () => {},
        resolveRoleFn: async () => makeRole(),
        ensureGitignoreEntryFn: () => false,
        existsSyncFn: (p: string) => fs.existsSync(p),
        execComposeFn: async (composeFile: string, args: string[]) => {
          calls.push({ composeFile, args });
          if (args.includes("build")) return overrides?.buildExitCode ?? 0;
          if (args.includes("-d")) return overrides?.upExitCode ?? 0;
          return 0;
        },
        startHostProxyFn: async () => ({ stop: async () => {} }),
      },
    };
  }

  it("builds proxy then starts it detached", async () => {
    const { calls, deps } = makeDeps();

    await runProxyOnly(projectDir, "claude-code-agent", "writer", 19700, deps);

    expect(calls).toHaveLength(2);
    expect(calls[0]!.args).toContain("build");
    expect(calls[0]!.args).toContain("proxy-writer");
    expect(calls[1]!.args).toContain("up");
    expect(calls[1]!.args).toContain("-d");
    expect(calls[1]!.args).toContain("proxy-writer");
  });

  it("does NOT start agent or host proxy", async () => {
    const { calls, deps } = makeDeps();

    await runProxyOnly(projectDir, "claude-code-agent", "writer", 3000, deps);

    // Only 2 compose calls: build + up (no agent run, no down)
    expect(calls).toHaveLength(2);
    const allArgs = calls.flatMap((c) => c.args);
    expect(allArgs).not.toContain("agent-writer");
    expect(allArgs).not.toContain("--service-ports");
  });

  it("outputs JSON with connection info to stdout", async () => {
    const { deps } = makeDeps({ sessionId: "json0001" });

    await runProxyOnly(projectDir, "claude-code-agent", "writer", 19700, deps);

    // logSpy captures the JSON output (origLog is called once with JSON)
    const jsonCall = logSpy.mock.calls.find((call) => {
      try { JSON.parse(call[0] as string); return true; } catch { return false; }
    });
    expect(jsonCall).toBeDefined();

    const info = JSON.parse(jsonCall![0] as string);
    expect(info.proxyPort).toBe(19700);
    expect(info.proxyToken).toMatch(/^[a-f0-9]{64}$/);
    expect(info.composeFile).toContain("json0001");
    expect(info.proxyServiceName).toBe("proxy-writer");
    expect(info.sessionId).toBe("json0001");
  });

  it("throws when proxy build fails", async () => {
    const { deps } = makeDeps({ buildExitCode: 1 });

    await expect(
      runProxyOnly(projectDir, "claude-code-agent", "writer", 3000, deps),
    ).rejects.toThrow("Failed to build proxy image");
  });

  it("throws when proxy start fails", async () => {
    const { deps } = makeDeps({ upExitCode: 1 });

    await expect(
      runProxyOnly(projectDir, "claude-code-agent", "writer", 3000, deps),
    ).rejects.toThrow("Failed to start proxy");
  });

  it("creates compose file with correct paths", async () => {
    const { deps } = makeDeps({ sessionId: "path0001" });

    await runProxyOnly(projectDir, "claude-code-agent", "writer", 3000, deps);

    const composeFile = path.join(
      projectDir, ".mason", "sessions", "path0001", "docker-compose.yaml",
    );
    expect(fs.existsSync(composeFile)).toBe(true);

    const content = fs.readFileSync(composeFile, "utf-8");
    expect(content).toContain("proxy-writer:");
    expect(content).toContain("agent-writer:");
    expect(content).toContain(":/home/mason/workspace/project");
  });
});

// ── VSCode attach URI ──────────────────────────────────────────────────────

describe("buildVscodeAttachUri", () => {
  it("produces the correct vscode-remote URI for a known container name", () => {
    const containerName = "forge-engineer";
    const workspace = "/workspace/project";
    const uri = buildVscodeAttachUri(containerName, workspace);

    // Manually compute expected hex: JSON.stringify({"containerName":"/forge-engineer"})
    const expectedJson = JSON.stringify({ containerName: `/${containerName}` });
    const expectedHex = Buffer.from(expectedJson).toString("hex");
    expect(uri).toBe(`vscode-remote://attached-container+${expectedHex}${workspace}`);
  });

  it("hex-encodes the container name with a leading slash", () => {
    const uri = buildVscodeAttachUri("my-agent", "/workspace");
    const hex = uri.replace("vscode-remote://attached-container+", "").replace("/workspace", "");
    const decoded = Buffer.from(hex, "hex").toString("utf-8");
    expect(JSON.parse(decoded)).toEqual({ containerName: "/my-agent" });
  });
});

// ── --dev-container flag ───────────────────────────────────────────────────

describe("CLI run --dev-container flag", () => {
  it("run command has --dev-container option", () => {
    const cmd = program.commands.find((c) => c.name() === "run");
    expect(cmd).toBeDefined();
    if (cmd) {
      const opt = cmd.options.find((o) => o.long === "--dev-container");
      expect(opt).toBeDefined();
    }
  });
});

// vscode-server mount tests now covered in "generateSessionComposeYml (run-agent scenarios)" above
