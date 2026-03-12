import { type MockInstance, describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { program } from "../../src/cli/index.js";
import {
  generateSessionId,
  readRunConfig,
  validateDockerfiles,
  generateComposeYml,
  resolveRequiredCredentials,
  displayCredentials,
  runAgent,
  resolveAgentType,
  isKnownAgentType,
  getKnownAgentTypeNames,
  AGENT_TYPE_ALIASES,
} from "../../src/cli/commands/run-agent.js";
import type { ChapterEntry } from "../../src/runtime/home.js";

// ── Command Registration ────────────────────────────────────────────────

describe("CLI run command", () => {
  it("has the run command registered at top level", () => {
    const cmd = program.commands.find((c) => c.name() === "run");
    expect(cmd).toBeDefined();
    if (cmd) {
      expect(cmd.description()).toContain("Run a role");
    }
  });

  it("has hidden agent command for backward compatibility", () => {
    const cmd = program.commands.find((c) => c.name() === "agent");
    expect(cmd).toBeDefined();
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
});

// ── Agent Type Resolution ────────────────────────────────────────────────

describe("resolveAgentType", () => {
  it("resolves alias 'claude' to 'claude-code'", () => {
    expect(resolveAgentType("claude")).toBe("claude-code");
  });

  it("resolves alias 'pi' to 'pi-coding-agent'", () => {
    expect(resolveAgentType("pi")).toBe("pi-coding-agent");
  });

  it("resolves alias 'mcp' to 'mcp-agent'", () => {
    expect(resolveAgentType("mcp")).toBe("mcp-agent");
  });

  it("resolves direct agent type 'claude-code'", () => {
    expect(resolveAgentType("claude-code")).toBe("claude-code");
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
    expect(isKnownAgentType("claude-code")).toBe(true);
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
    expect(names).toContain("claude-code");
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

// ── readRunConfig ───────────────────────────────────────────────────────

describe("readRunConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-run-agent-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeConfig(config: Record<string, unknown>): void {
    const configDir = path.join(tmpDir, ".clawmasons");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "chapter.json"),
      JSON.stringify(config),
    );
  }

  it("reads valid config", () => {
    writeConfig({
      chapter: "acme.platform",
      "docker-registries": ["local"],
      "docker-build": "/path/to/docker",
    });
    const config = readRunConfig(tmpDir);
    expect(config.chapter).toBe("acme.platform");
    expect(config["docker-build"]).toBe("/path/to/docker");
  });

  it("throws when .clawmasons/chapter.json is missing", () => {
    expect(() => readRunConfig(tmpDir)).toThrow("run-init");
  });

  it("throws when chapter.json is not valid JSON", () => {
    const configDir = path.join(tmpDir, ".clawmasons");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "chapter.json"), "not json");
    expect(() => readRunConfig(tmpDir)).toThrow("not valid JSON");
  });

  it("throws when chapter field is missing", () => {
    writeConfig({ "docker-build": "/path" });
    expect(() => readRunConfig(tmpDir)).toThrow("chapter");
  });

  it("throws when docker-build field is missing", () => {
    writeConfig({ chapter: "acme.platform" });
    expect(() => readRunConfig(tmpDir)).toThrow("docker-build");
  });
});

// ── validateDockerfiles ─────────────────────────────────────────────────

describe("validateDockerfiles", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-run-agent-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function setupDockerfiles(agent: string, role: string): void {
    const proxyDir = path.join(tmpDir, "proxy", role);
    const agentDir = path.join(tmpDir, "agent", agent, role);
    fs.mkdirSync(proxyDir, { recursive: true });
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(path.join(proxyDir, "Dockerfile"), "FROM node:20\n");
    fs.writeFileSync(path.join(agentDir, "Dockerfile"), "FROM node:20\n");
  }

  it("returns paths when all Dockerfiles exist", () => {
    setupDockerfiles("note-taker", "writer");
    const result = validateDockerfiles(tmpDir, "note-taker", "writer");
    expect(result.proxyDockerfile).toContain("proxy/writer/Dockerfile");
    expect(result.agentDockerfile).toContain("agent/note-taker/writer/Dockerfile");
  });

  it("throws when proxy Dockerfile is missing", () => {
    const agentDir = path.join(tmpDir, "agent", "note-taker", "writer");
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(path.join(agentDir, "Dockerfile"), "FROM node:20\n");

    expect(() => validateDockerfiles(tmpDir, "note-taker", "writer")).toThrow(
      "Proxy Dockerfile not found",
    );
  });

  it("throws when agent Dockerfile is missing", () => {
    const proxyDir = path.join(tmpDir, "proxy", "writer");
    fs.mkdirSync(proxyDir, { recursive: true });
    fs.writeFileSync(path.join(proxyDir, "Dockerfile"), "FROM node:20\n");

    expect(() => validateDockerfiles(tmpDir, "note-taker", "writer")).toThrow(
      "Agent Dockerfile not found",
    );
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

// ── generateComposeYml ──────────────────────────────────────────────────

describe("generateComposeYml", () => {
  const defaultOpts = {
    dockerBuildPath: "/chapters/acme/docker",
    projectDir: "/projects/my-project",
    agent: "note-taker",
    role: "writer",
    logsDir: "/projects/my-project/.clawmasons/logs",
    proxyToken: "test-token-abc",
    credentialProxyToken: "cred-token-xyz",
  };

  it("generates valid compose YAML with correct service names", () => {
    const yml = generateComposeYml(defaultOpts);

    // Service names
    expect(yml).toContain("proxy-writer:");
    expect(yml).toContain("agent-note-taker-writer:");
    // credential-service is no longer a Docker service (runs in-process)
    expect(yml).not.toContain("credential-service:");

    // Build contexts
    expect(yml).toContain('context: "/chapters/acme/docker"');
    expect(yml).toContain('dockerfile: "proxy/writer/Dockerfile"');
    expect(yml).toContain('dockerfile: "agent/note-taker/writer/Dockerfile"');

    // Volumes
    expect(yml).toContain('"/projects/my-project:/workspace"');
    expect(yml).toContain('"/projects/my-project/.clawmasons/logs:/logs"');

    // Proxy exposes port to host for in-process credential service
    expect(yml).toContain("3000:9090");

    // Agent is interactive
    expect(yml).toContain("stdin_open: true");
    expect(yml).toContain("tty: true");
    expect(yml).toContain("init: true");
  });

  it("includes CREDENTIAL_PROXY_TOKEN in proxy environment", () => {
    const yml = generateComposeYml(defaultOpts);

    // Proxy should have CREDENTIAL_PROXY_TOKEN
    const proxySection = yml.split("agent-note-taker-writer:")[0]!;
    expect(proxySection).toContain("CREDENTIAL_PROXY_TOKEN=cred-token-xyz");
  });

  it("agent depends on proxy directly", () => {
    const yml = generateComposeYml(defaultOpts);

    // Extract agent section
    const agentSection = yml.split("agent-note-taker-writer:")[1]!;
    expect(agentSection).toContain("depends_on:");
    expect(agentSection).toContain("- proxy-writer");
  });

  it("agent environment has only MCP_PROXY_TOKEN, no API keys", () => {
    const yml = generateComposeYml(defaultOpts);

    // Extract agent section
    const agentSection = yml.split("agent-note-taker-writer:")[1]!;

    // Should have MCP_PROXY_TOKEN
    expect(agentSection).toContain("MCP_PROXY_TOKEN=test-token-abc");

    // Should NOT have any API keys
    expect(agentSection).not.toContain("OPENROUTER_API_KEY");
    expect(agentSection).not.toContain("ANTHROPIC_API_KEY");
    expect(agentSection).not.toContain("OPENAI_API_KEY");
    expect(agentSection).not.toContain("GEMINI_API_KEY");
    expect(agentSection).not.toContain("MISTRAL_API_KEY");
    expect(agentSection).not.toContain("GROQ_API_KEY");
    expect(agentSection).not.toContain("XAI_API_KEY");
    expect(agentSection).not.toContain("AZURE_OPENAI_API_KEY");

    // Should NOT have CHAPTER_PROXY_TOKEN (renamed to MCP_PROXY_TOKEN)
    expect(agentSection).not.toContain("CHAPTER_PROXY_TOKEN");
  });

  it("proxy has CHAPTER_PROXY_TOKEN", () => {
    const yml = generateComposeYml(defaultOpts);

    const proxySection = yml.split("agent-note-taker-writer:")[0]!;
    expect(proxySection).toContain("CHAPTER_PROXY_TOKEN=test-token-abc");
  });

  it("uses correct Dockerfile paths for different agent/role combos", () => {
    const yml = generateComposeYml({
      ...defaultOpts,
      agent: "coder",
      role: "reviewer",
      proxyToken: "token-123",
      credentialProxyToken: "cred-456",
    });

    expect(yml).toContain("proxy-reviewer:");
    expect(yml).toContain("agent-coder-reviewer:");
    expect(yml).toContain('dockerfile: "proxy/reviewer/Dockerfile"');
    expect(yml).toContain('dockerfile: "agent/coder/reviewer/Dockerfile"');
  });

  it("includes role mounts in agent volumes", () => {
    const yml = generateComposeYml({
      ...defaultOpts,
      roleMounts: [
        { source: "/host/data", target: "/container/data", readonly: false },
      ],
    });

    const agentSection = yml.split("agent-note-taker-writer:")[1]!;
    expect(agentSection).toContain('"/host/data:/container/data"');
    expect(agentSection).toContain('"/projects/my-project:/workspace"');
  });

  it("appends :ro for readonly role mounts", () => {
    const yml = generateComposeYml({
      ...defaultOpts,
      roleMounts: [
        { source: "/configs", target: "/etc/app", readonly: true },
      ],
    });

    const agentSection = yml.split("agent-note-taker-writer:")[1]!;
    expect(agentSection).toContain('"/configs:/etc/app:ro"');
  });

  it("does not add role mounts to proxy volumes", () => {
    const yml = generateComposeYml({
      ...defaultOpts,
      roleMounts: [
        { source: "/host/data", target: "/mnt/data", readonly: false },
      ],
    });

    const proxySection = yml.split("agent-note-taker-writer:")[0]!;
    expect(proxySection).not.toContain("/mnt/data");
  });

  it("agent has no extra mounts when roleMounts is undefined", () => {
    const yml = generateComposeYml(defaultOpts);
    const agentSection = yml.split("agent-note-taker-writer:")[1]!;
    const volumeSection = agentSection.split("volumes:")[1]!.split("depends_on:")[0]!;

    const mountLines = volumeSection.split("\n").filter((l) => l.includes("- \""));
    expect(mountLines).toHaveLength(1);
    expect(mountLines[0]).toContain("/workspace");
  });
});

// ── runAgent (integration) ──────────────────────────────────────────────

describe("runAgent", () => {
  let tmpDir: string;
  let projectDir: string;
  let dockerBuildPath: string;
  let exitSpy: MockInstance;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  // Default chapter entry returned by findRoleEntryByRoleFn
  function makeChapterEntry(overrides?: Partial<ChapterEntry>): ChapterEntry {
    return {
      lodge: "acme",
      chapter: "platform",
      role: "writer",
      dockerBuild: dockerBuildPath,
      roleDir: path.join(tmpDir, "clawmasons-home", "acme", "platform", "writer"),
      agents: ["note-taker"],
      createdAt: "2026-03-10T00:00:00Z",
      updatedAt: "2026-03-10T00:00:00Z",
      ...overrides,
    };
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-run-agent-test-"));

    // Set up a mock chapter project with docker build directory
    dockerBuildPath = path.join(tmpDir, "chapter-project", "docker");

    // Create proxy and agent Dockerfiles
    fs.mkdirSync(path.join(dockerBuildPath, "proxy", "writer"), { recursive: true });
    fs.writeFileSync(
      path.join(dockerBuildPath, "proxy", "writer", "Dockerfile"),
      "FROM node:20\n",
    );
    fs.mkdirSync(path.join(dockerBuildPath, "agent", "note-taker", "writer"), { recursive: true });
    fs.writeFileSync(
      path.join(dockerBuildPath, "agent", "note-taker", "writer", "Dockerfile"),
      "FROM node:20\n",
    );

    // Set up the project directory (no .clawmasons/chapter.json needed now)
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
    credServiceExitCode?: number;
    agentExitCode?: number;
    downExitCode?: number;
    sessionId?: string;
    chapterEntry?: ChapterEntry | null;
    initRoleCalled?: { called: boolean };
    gitignoreCalled?: { called: boolean; dir?: string; pattern?: string };
  }) {
    const calls: Array<{ composeFile: string; args: string[]; opts?: { interactive?: boolean } }> = [];
    const entry = overrides?.chapterEntry === null
      ? undefined
      : overrides?.chapterEntry ?? makeChapterEntry();

    return {
      calls,
      deps: {
        generateSessionIdFn: () => overrides?.sessionId ?? "abcd1234",
        checkDockerComposeFn: () => {},
        getClawmasonsHomeFn: () => path.join(tmpDir, "clawmasons-home"),
        findRoleEntryByRoleFn: () => entry,
        initRoleFn: async () => {
          if (overrides?.initRoleCalled) {
            overrides.initRoleCalled.called = true;
          }
        },
        ensureGitignoreEntryFn: (dir: string, pattern: string) => {
          if (overrides?.gitignoreCalled) {
            overrides.gitignoreCalled.called = true;
            overrides.gitignoreCalled.dir = dir;
            overrides.gitignoreCalled.pattern = pattern;
          }
          return false;
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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        startCredentialServiceFn: async (_opts: {
          proxyPort: number;
          credentialProxyToken: string;
          envCredentials: Record<string, string>;
        }) => {
          if (overrides?.credServiceExitCode && overrides.credServiceExitCode !== 0) {
            throw new Error("Mock credential service startup failure");
          }
          return { disconnect: () => {}, close: () => {} };
        },
      },
    };
  }

  it("reads role from chapters.json when initialized", async () => {
    const { deps } = makeMockDeps({ sessionId: "sess0001" });

    await runAgent(projectDir, "note-taker", "writer", deps);

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("acme.platform");
    expect(logOutput).toContain("note-taker");
    expect(logOutput).toContain("writer");
  });

  it("auto-invokes init-role when role not found", async () => {
    const initRoleCalled = { called: false };
    let callCount = 0;

    const { deps } = makeMockDeps({ initRoleCalled });

    // Override findRoleEntryByRoleFn to return undefined first, then the entry
    deps.findRoleEntryByRoleFn = () => {
      callCount++;
      if (callCount === 1) return undefined; // First call: not found
      return makeChapterEntry(); // Second call (after auto-init): found
    };

    await runAgent(projectDir, "note-taker", "writer", deps);

    expect(initRoleCalled.called).toBe(true);
    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("Auto-initializing");
  });

  it("exits 1 when auto-init fails and role still not found", async () => {
    const { deps } = makeMockDeps({ chapterEntry: null });

    await runAgent(projectDir, "note-taker", "writer", deps);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("agent failed");
    expect(errorOutput).toContain("init-role");
  });

  it("creates per-project .clawmasons/sessions/<id>/ for session state", async () => {
    const { deps } = makeMockDeps({ sessionId: "sess0001" });

    await runAgent(projectDir, "note-taker", "writer", deps);

    const sessionDir = path.join(projectDir, ".clawmasons", "sessions", "sess0001", "docker");
    expect(fs.existsSync(sessionDir)).toBe(true);

    const composeFile = path.join(sessionDir, "docker-compose.yml");
    expect(fs.existsSync(composeFile)).toBe(true);

    const content = fs.readFileSync(composeFile, "utf-8");
    expect(content).toContain("proxy-writer:");
    expect(content).toContain("agent-note-taker-writer:");
    // credential-service is no longer a Docker service
    expect(content).not.toContain("credential-service:");
  });

  it("appends .clawmasons to project .gitignore", async () => {
    const gitignoreCalled = { called: false, dir: "", pattern: "" };
    const { deps } = makeMockDeps({ gitignoreCalled });

    await runAgent(projectDir, "note-taker", "writer", deps);

    expect(gitignoreCalled.called).toBe(true);
    expect(gitignoreCalled.dir).toBe(projectDir);
    expect(gitignoreCalled.pattern).toBe(".clawmasons");
  });

  it("uses targetDir from chapters.json when set", async () => {
    const customDir = path.join(tmpDir, "custom-roles", "writer");
    const customDockerBuild = path.join(tmpDir, "custom-docker");

    // Create Dockerfiles at custom docker build path
    fs.mkdirSync(path.join(customDockerBuild, "proxy", "writer"), { recursive: true });
    fs.writeFileSync(path.join(customDockerBuild, "proxy", "writer", "Dockerfile"), "FROM node:20\n");
    fs.mkdirSync(path.join(customDockerBuild, "agent", "note-taker", "writer"), { recursive: true });
    fs.writeFileSync(path.join(customDockerBuild, "agent", "note-taker", "writer", "Dockerfile"), "FROM node:20\n");

    const entry = makeChapterEntry({
      targetDir: customDir,
      roleDir: customDir,
      dockerBuild: customDockerBuild,
    });

    const { deps } = makeMockDeps({ sessionId: "target01", chapterEntry: entry });

    await runAgent(projectDir, "note-taker", "writer", deps);

    const composeFile = path.join(
      projectDir, ".clawmasons", "sessions", "target01", "docker", "docker-compose.yml",
    );
    const content = fs.readFileSync(composeFile, "utf-8");
    expect(content).toContain(`context: "${customDockerBuild}"`);
  });

  it("mounts CWD as /workspace (unchanged behavior)", async () => {
    const { deps } = makeMockDeps({ sessionId: "mount001" });

    await runAgent(projectDir, "note-taker", "writer", deps);

    const composeFile = path.join(
      projectDir, ".clawmasons", "sessions", "mount001", "docker", "docker-compose.yml",
    );
    const content = fs.readFileSync(composeFile, "utf-8");
    expect(content).toContain(`"${projectDir}:/workspace"`);
  });

  it("generates unique session IDs per invocation", async () => {
    let callCount = 0;
    const ids = ["aaaa1111", "bbbb2222"];

    const baseDeps = {
      checkDockerComposeFn: () => {},
      execComposeFn: async () => 0,
      getClawmasonsHomeFn: () => path.join(tmpDir, "clawmasons-home"),
      findRoleEntryByRoleFn: () => makeChapterEntry(),
      initRoleFn: async () => {},
      ensureGitignoreEntryFn: () => false,
      startCredentialServiceFn: async () => ({ disconnect: () => {}, close: () => {} }),
    };

    await runAgent(projectDir, "note-taker", "writer", {
      ...baseDeps,
      generateSessionIdFn: () => ids[callCount++]!,
    });

    await runAgent(projectDir, "note-taker", "writer", {
      ...baseDeps,
      generateSessionIdFn: () => ids[callCount++]!,
    });

    const sessionsDir = path.join(projectDir, ".clawmasons", "sessions");
    const sessions = fs.readdirSync(sessionsDir);
    expect(sessions).toContain("aaaa1111");
    expect(sessions).toContain("bbbb2222");
  });

  it("starts proxy detached, then credential service in-process, then agent interactively", async () => {
    const { calls, deps } = makeMockDeps();

    await runAgent(projectDir, "note-taker", "writer", deps);

    // First call: proxy up -d
    expect(calls[0]!.args).toContain("up");
    expect(calls[0]!.args).toContain("-d");
    expect(calls[0]!.args).toContain("proxy-writer");

    // Second call: agent run (interactive) — credential service is in-process, not a Docker call
    expect(calls[1]!.args).toContain("run");
    expect(calls[1]!.args).toContain("--rm");
    expect(calls[1]!.args).toContain("--service-ports");
    expect(calls[1]!.args).toContain("agent-note-taker-writer");
    expect(calls[1]!.opts?.interactive).toBe(true);
  });

  it("tears down all services after agent exits", async () => {
    const { calls, deps } = makeMockDeps();

    await runAgent(projectDir, "note-taker", "writer", deps);

    // Third call should be docker compose down (proxy up, agent run, down)
    expect(calls[2]!.args).toContain("down");
  });

  it("retains session directory after exit", async () => {
    const { deps } = makeMockDeps({ sessionId: "keep0001" });

    await runAgent(projectDir, "note-taker", "writer", deps);

    const sessionDir = path.join(projectDir, ".clawmasons", "sessions", "keep0001");
    expect(fs.existsSync(sessionDir)).toBe(true);
  });

  it("compose file references correct Dockerfiles from docker-build path", async () => {
    const { deps } = makeMockDeps({ sessionId: "ref00001" });

    await runAgent(projectDir, "note-taker", "writer", deps);

    const composeFile = path.join(
      projectDir, ".clawmasons", "sessions", "ref00001", "docker", "docker-compose.yml",
    );
    const content = fs.readFileSync(composeFile, "utf-8");

    expect(content).toContain(`context: "${dockerBuildPath}"`);
    expect(content).toContain('dockerfile: "proxy/writer/Dockerfile"');
    expect(content).toContain('dockerfile: "agent/note-taker/writer/Dockerfile"');
  });

  it("compose file has CREDENTIAL_PROXY_TOKEN in proxy", async () => {
    const { deps } = makeMockDeps({ sessionId: "tok00001" });

    await runAgent(projectDir, "note-taker", "writer", deps);

    const composeFile = path.join(
      projectDir, ".clawmasons", "sessions", "tok00001", "docker", "docker-compose.yml",
    );
    const content = fs.readFileSync(composeFile, "utf-8");

    // CREDENTIAL_PROXY_TOKEN should appear in proxy (credential service is in-process)
    expect(content).toContain("CREDENTIAL_PROXY_TOKEN=");

    // Token should be a 64-char hex string (32 bytes)
    const tokenMatch = content.match(/CREDENTIAL_PROXY_TOKEN=([a-f0-9]+)/);
    expect(tokenMatch).toBeTruthy();
    expect(tokenMatch![1]).toMatch(/^[a-f0-9]{64}$/);
  });

  it("compose file has no API keys in agent environment", async () => {
    const { deps } = makeMockDeps({ sessionId: "nokeys01" });

    await runAgent(projectDir, "note-taker", "writer", deps);

    const composeFile = path.join(
      projectDir, ".clawmasons", "sessions", "nokeys01", "docker", "docker-compose.yml",
    );
    const content = fs.readFileSync(composeFile, "utf-8");
    const agentSection = content.split("agent-note-taker-writer:")[1]!;

    expect(agentSection).toContain("MCP_PROXY_TOKEN=");
    expect(agentSection).not.toContain("OPENROUTER_API_KEY");
    expect(agentSection).not.toContain("ANTHROPIC_API_KEY");
    expect(agentSection).not.toContain("OPENAI_API_KEY");
  });

  it("generates unique tokens per invocation", async () => {
    const { deps: deps1 } = makeMockDeps({ sessionId: "uniq0001" });
    const { deps: deps2 } = makeMockDeps({ sessionId: "uniq0002" });

    await runAgent(projectDir, "note-taker", "writer", deps1);
    await runAgent(projectDir, "note-taker", "writer", deps2);

    const file1 = path.join(
      projectDir, ".clawmasons", "sessions", "uniq0001", "docker", "docker-compose.yml",
    );
    const file2 = path.join(
      projectDir, ".clawmasons", "sessions", "uniq0002", "docker", "docker-compose.yml",
    );

    const content1 = fs.readFileSync(file1, "utf-8");
    const content2 = fs.readFileSync(file2, "utf-8");

    // Extract CHAPTER_PROXY_TOKEN from each
    const proxyToken1 = content1.match(/CHAPTER_PROXY_TOKEN=([a-f0-9]+)/)![1];
    const proxyToken2 = content2.match(/CHAPTER_PROXY_TOKEN=([a-f0-9]+)/)![1];
    expect(proxyToken1).not.toBe(proxyToken2);

    // Extract CREDENTIAL_PROXY_TOKEN from each
    const credToken1 = content1.match(/CREDENTIAL_PROXY_TOKEN=([a-f0-9]+)/)![1];
    const credToken2 = content2.match(/CREDENTIAL_PROXY_TOKEN=([a-f0-9]+)/)![1];
    expect(credToken1).not.toBe(credToken2);
  });

  it("logs session info and completion message", async () => {
    const { deps } = makeMockDeps({ sessionId: "log00001" });

    await runAgent(projectDir, "note-taker", "writer", deps);

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("acme.platform");
    expect(logOutput).toContain("note-taker");
    expect(logOutput).toContain("writer");
    expect(logOutput).toContain("log00001");
    expect(logOutput).toContain("agent complete");
  });

  // ── Error Cases ──────────────────────────────────────────────────────

  it("exits 1 when docker compose is not available", async () => {
    const { deps } = makeMockDeps();
    deps.checkDockerComposeFn = () => {
      throw new Error("Docker Compose v2 is required");
    };

    await runAgent(projectDir, "note-taker", "writer", deps);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("agent failed");
    expect(errorOutput).toContain("Docker Compose");
  });

  it("exits 1 when proxy Dockerfile is missing", async () => {
    // Remove the proxy Dockerfile
    fs.rmSync(path.join(dockerBuildPath, "proxy"), { recursive: true });

    const { deps } = makeMockDeps();
    await runAgent(projectDir, "note-taker", "writer", deps);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("Proxy Dockerfile not found");
  });

  it("exits 1 when agent Dockerfile is missing", async () => {
    // Remove the agent Dockerfile
    fs.rmSync(path.join(dockerBuildPath, "agent"), { recursive: true });

    const { deps } = makeMockDeps();
    await runAgent(projectDir, "note-taker", "writer", deps);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("Agent Dockerfile not found");
  });

  it("exits 1 when proxy fails to start", async () => {
    const { deps } = makeMockDeps({ proxyExitCode: 1 });

    await runAgent(projectDir, "note-taker", "writer", deps);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("Failed to start proxy");
  });

  it("exits 1 when credential service fails to start", async () => {
    const { deps } = makeMockDeps({ credServiceExitCode: 1 });

    await runAgent(projectDir, "note-taker", "writer", deps);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("Failed to start credential service");
  });

  it("creates logs directory if it does not exist", async () => {
    const { deps } = makeMockDeps();

    await runAgent(projectDir, "note-taker", "writer", deps);

    const logsDir = path.join(projectDir, ".clawmasons", "logs");
    expect(fs.existsSync(logsDir)).toBe(true);
    expect(fs.statSync(logsDir).isDirectory()).toBe(true);
  });
});
