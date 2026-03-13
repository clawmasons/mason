import { type MockInstance, describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { program } from "../../src/cli/index.js";
import {
  generateSessionId,
  generateComposeYml,
  resolveRequiredCredentials,
  displayCredentials,
  runAgent,
  runProxyOnly,
  resolveAgentType,
  isKnownAgentType,
  getKnownAgentTypeNames,
} from "../../src/cli/commands/run-agent.js";
import type { RoleType } from "@clawmasons/shared";

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
    dockerBuildDir: "/projects/my-project/.clawmasons/docker/writer",
    dockerDir: "/projects/my-project/.clawmasons/docker",
    projectDir: "/projects/my-project",
    agent: "claude-code",
    role: "writer",
    logsDir: "/projects/my-project/.clawmasons/sessions/abc123/logs",
    proxyToken: "test-token-abc",
    credentialProxyToken: "cred-token-xyz",
  };

  it("generates valid compose YAML with correct service names", () => {
    const yml = generateComposeYml(defaultOpts);

    // Service names (new format: agent-{role}, not agent-{agent}-{role})
    expect(yml).toContain("proxy-writer:");
    expect(yml).toContain("agent-writer:");
    // credential-service is no longer a Docker service (runs in-process)
    expect(yml).not.toContain("credential-service:");

    // Proxy: context is dockerDir, dockerfile is relative path to mcp-proxy
    expect(yml).toContain(`context: "${defaultOpts.dockerDir}"`);
    expect(yml).toContain("mcp-proxy/Dockerfile");

    // Agent: context is dockerBuildDir/agent-type
    expect(yml).toContain(`context: "${defaultOpts.dockerBuildDir}/claude-code"`);
    expect(yml).toContain("dockerfile: Dockerfile");

    // Volumes: project mount uses /home/mason/workspace/project
    expect(yml).toContain(`"${defaultOpts.projectDir}:/home/mason/workspace/project"`);

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
    const proxySection = yml.split("agent-writer:")[0]!;
    expect(proxySection).toContain("CREDENTIAL_PROXY_TOKEN=cred-token-xyz");
  });

  it("includes PROJECT_DIR in proxy environment", () => {
    const yml = generateComposeYml(defaultOpts);

    const proxySection = yml.split("agent-writer:")[0]!;
    expect(proxySection).toContain("PROJECT_DIR=/home/mason/workspace/project");
  });

  it("proxy project mount is read-write (no :ro)", () => {
    const yml = generateComposeYml(defaultOpts);

    const proxySection = yml.split("agent-writer:")[0]!;
    expect(proxySection).toContain(`"${defaultOpts.projectDir}:/home/mason/workspace/project"`);
    expect(proxySection).not.toContain("/home/mason/workspace/project:ro");
  });

  it("agent depends on proxy directly", () => {
    const yml = generateComposeYml(defaultOpts);

    // Extract agent section
    const agentSection = yml.split("agent-writer:")[1]!;
    expect(agentSection).toContain("depends_on:");
    expect(agentSection).toContain("- proxy-writer");
  });

  it("agent environment has only MCP_PROXY_TOKEN, no API keys", () => {
    const yml = generateComposeYml(defaultOpts);

    // Extract agent section
    const agentSection = yml.split("agent-writer:")[1]!;

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

    const proxySection = yml.split("agent-writer:")[0]!;
    expect(proxySection).toContain("CHAPTER_PROXY_TOKEN=test-token-abc");
  });

  it("uses correct Dockerfile paths for different agent/role combos", () => {
    const yml = generateComposeYml({
      ...defaultOpts,
      dockerBuildDir: "/projects/my-project/.clawmasons/docker/reviewer",
      agent: "codex",
      role: "reviewer",
      proxyToken: "token-123",
      credentialProxyToken: "cred-456",
    });

    expect(yml).toContain("proxy-reviewer:");
    expect(yml).toContain("agent-reviewer:");
    expect(yml).toContain(`context: "${defaultOpts.dockerDir}"`);
    expect(yml).toContain(`context: "/projects/my-project/.clawmasons/docker/reviewer/codex"`);
  });

  it("includes role mounts in agent volumes", () => {
    const yml = generateComposeYml({
      ...defaultOpts,
      roleMounts: [
        { source: "/host/data", target: "/container/data", readonly: false },
      ],
    });

    const agentSection = yml.split("agent-writer:")[1]!;
    expect(agentSection).toContain('"/host/data:/container/data"');
    expect(agentSection).toContain(`"${defaultOpts.projectDir}:/home/mason/workspace/project"`);
  });

  it("appends :ro for readonly role mounts", () => {
    const yml = generateComposeYml({
      ...defaultOpts,
      roleMounts: [
        { source: "/configs", target: "/etc/app", readonly: true },
      ],
    });

    const agentSection = yml.split("agent-writer:")[1]!;
    expect(agentSection).toContain('"/configs:/etc/app:ro"');
  });

  it("does not add role mounts to proxy volumes", () => {
    const yml = generateComposeYml({
      ...defaultOpts,
      roleMounts: [
        { source: "/host/data", target: "/mnt/data", readonly: false },
      ],
    });

    const proxySection = yml.split("agent-writer:")[0]!;
    expect(proxySection).not.toContain("/mnt/data");
  });

  it("agent has no extra mounts when roleMounts is undefined", () => {
    const yml = generateComposeYml(defaultOpts);
    const agentSection = yml.split("agent-writer:")[1]!;
    const volumeSection = agentSection.split("volumes:")[1]!.split("depends_on:")[0]!;

    const mountLines = volumeSection.split("\n").filter((l) => l.includes("- \""));
    expect(mountLines).toHaveLength(1);
    expect(mountLines[0]).toContain("/home/mason/workspace/project");
  });
});

// ── runAgent (integration) ──────────────────────────────────────────────

describe("runAgent", () => {
  let tmpDir: string;
  let projectDir: string;
  let exitSpy: MockInstance;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  // Minimal RoleType fixture for testing.
  // metadata.name uses "role-" prefix so getAppShortName strips it → "writer".
  function makeRoleType(overrides?: Partial<RoleType>): RoleType {
    return {
      metadata: { name: "role-writer", version: "1.0.0" },
      source: {
        agentDialect: "claude-code",
        agentDir: ".claude",
        roleDir: path.join(projectDir, ".claude", "roles", "writer"),
      },
      skills: [],
      commands: [],
      tools: [],
      apps: [],
      ...overrides,
    } as RoleType;
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-run-agent-test-"));
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
    roleType?: RoleType;
    resolveRoleError?: Error;
    gitignoreCalled?: { called: boolean; dir?: string; pattern?: string };
    dockerBuildExists?: boolean;
  }) {
    const calls: Array<{ composeFile: string; args: string[]; opts?: { interactive?: boolean } }> = [];

    // Pre-create docker build dir if needed (default: exists)
    const shouldExist = overrides?.dockerBuildExists ?? true;
    const dockerDir = path.join(projectDir, ".clawmasons", "docker");
    const dockerBuildDir = path.join(dockerDir, "writer");
    if (shouldExist) {
      fs.mkdirSync(path.join(dockerBuildDir, "claude-code"), { recursive: true });
      fs.writeFileSync(path.join(dockerBuildDir, "claude-code", "Dockerfile"), "FROM node:20\n");
      fs.mkdirSync(path.join(dockerBuildDir, "mcp-proxy"), { recursive: true });
      fs.writeFileSync(path.join(dockerBuildDir, "mcp-proxy", "Dockerfile"), "FROM node:20\n");
    }

    return {
      calls,
      deps: {
        generateSessionIdFn: () => overrides?.sessionId ?? "abcd1234",
        checkDockerComposeFn: () => {},
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        resolveRoleFn: async (_roleName: string, _projectDir: string) => {
          if (overrides?.resolveRoleError) throw overrides.resolveRoleError;
          return overrides?.roleType ?? makeRoleType();
        },
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

  it("resolves role and displays agent info", async () => {
    const { deps } = makeMockDeps({ sessionId: "sess0001" });

    await runAgent(projectDir, "claude-code", "writer", deps);

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("claude-code");
    expect(logOutput).toContain("writer");
  });

  it("exits 1 when role resolution fails", async () => {
    const { deps } = makeMockDeps({
      resolveRoleError: new Error("Role 'nonexistent' not found"),
    });

    await runAgent(projectDir, "claude-code", "nonexistent", deps);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("agent failed");
    expect(errorOutput).toContain("not found");
  });

  it("creates per-project .clawmasons/sessions/<id>/ for session state", async () => {
    const { deps } = makeMockDeps({ sessionId: "sess0001" });

    await runAgent(projectDir, "claude-code", "writer", deps);

    const sessionDir = path.join(projectDir, ".clawmasons", "sessions", "sess0001", "docker");
    expect(fs.existsSync(sessionDir)).toBe(true);

    const composeFile = path.join(sessionDir, "docker-compose.yml");
    expect(fs.existsSync(composeFile)).toBe(true);

    const content = fs.readFileSync(composeFile, "utf-8");
    expect(content).toContain("proxy-writer:");
    expect(content).toContain("agent-writer:");
    // credential-service is no longer a Docker service
    expect(content).not.toContain("credential-service:");
  });

  it("appends .clawmasons to project .gitignore", async () => {
    const gitignoreCalled = { called: false, dir: "", pattern: "" };
    const { deps } = makeMockDeps({ gitignoreCalled });

    await runAgent(projectDir, "claude-code", "writer", deps);

    expect(gitignoreCalled.called).toBe(true);
    expect(gitignoreCalled.dir).toBe(projectDir);
    expect(gitignoreCalled.pattern).toBe(".clawmasons");
  });

  it("mounts project dir as /home/mason/workspace/project", async () => {
    const { deps } = makeMockDeps({ sessionId: "mount001" });

    await runAgent(projectDir, "claude-code", "writer", deps);

    const composeFile = path.join(
      projectDir, ".clawmasons", "sessions", "mount001", "docker", "docker-compose.yml",
    );
    const content = fs.readFileSync(composeFile, "utf-8");
    expect(content).toContain(`"${projectDir}:/home/mason/workspace/project"`);
  });

  it("generates unique session IDs per invocation", async () => {
    let callCount = 0;
    const ids = ["aaaa1111", "bbbb2222"];

    const baseDeps = {
      checkDockerComposeFn: () => {},
      execComposeFn: async () => 0,
      resolveRoleFn: async () => makeRoleType(),
      ensureGitignoreEntryFn: () => false,
      existsSyncFn: (p: string) => fs.existsSync(p),
      startCredentialServiceFn: async () => ({ disconnect: () => {}, close: () => {} }),
    };

    // Pre-create docker build dirs for both runs
    const dockerDir = path.join(projectDir, ".clawmasons", "docker");
    const dockerBuildDir = path.join(dockerDir, "writer");
    fs.mkdirSync(path.join(dockerBuildDir, "claude-code"), { recursive: true });
    fs.writeFileSync(path.join(dockerBuildDir, "claude-code", "Dockerfile"), "FROM node:20\n");
    fs.mkdirSync(path.join(dockerBuildDir, "mcp-proxy"), { recursive: true });
    fs.writeFileSync(path.join(dockerBuildDir, "mcp-proxy", "Dockerfile"), "FROM node:20\n");

    await runAgent(projectDir, "claude-code", "writer", {
      ...baseDeps,
      generateSessionIdFn: () => ids[callCount++]!,
    });

    await runAgent(projectDir, "claude-code", "writer", {
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

    await runAgent(projectDir, "claude-code", "writer", deps);

    // First call: proxy up -d
    expect(calls[0]!.args).toContain("up");
    expect(calls[0]!.args).toContain("-d");
    expect(calls[0]!.args).toContain("proxy-writer");

    // Second call: agent run (interactive)
    expect(calls[1]!.args).toContain("run");
    expect(calls[1]!.args).toContain("--rm");
    expect(calls[1]!.args).toContain("--service-ports");
    expect(calls[1]!.args).toContain("agent-writer");
    expect(calls[1]!.opts?.interactive).toBe(true);
  });

  it("tears down all services after agent exits", async () => {
    const { calls, deps } = makeMockDeps();

    await runAgent(projectDir, "claude-code", "writer", deps);

    // Third call should be docker compose down (proxy up, agent run, down)
    expect(calls[2]!.args).toContain("down");
  });

  it("retains session directory after exit", async () => {
    const { deps } = makeMockDeps({ sessionId: "keep0001" });

    await runAgent(projectDir, "claude-code", "writer", deps);

    const sessionDir = path.join(projectDir, ".clawmasons", "sessions", "keep0001");
    expect(fs.existsSync(sessionDir)).toBe(true);
  });

  it("compose file references correct docker build paths", async () => {
    const { deps } = makeMockDeps({ sessionId: "ref00001" });

    await runAgent(projectDir, "claude-code", "writer", deps);

    const composeFile = path.join(
      projectDir, ".clawmasons", "sessions", "ref00001", "docker", "docker-compose.yml",
    );
    const content = fs.readFileSync(composeFile, "utf-8");

    const dockerDir = path.join(projectDir, ".clawmasons", "docker");
    const dockerBuildDir = path.join(dockerDir, "writer");
    expect(content).toContain(`context: "${dockerDir}"`);
    expect(content).toContain(`context: "${dockerBuildDir}/claude-code"`);
  });

  it("compose file has CREDENTIAL_PROXY_TOKEN in proxy", async () => {
    const { deps } = makeMockDeps({ sessionId: "tok00001" });

    await runAgent(projectDir, "claude-code", "writer", deps);

    const composeFile = path.join(
      projectDir, ".clawmasons", "sessions", "tok00001", "docker", "docker-compose.yml",
    );
    const content = fs.readFileSync(composeFile, "utf-8");

    // CREDENTIAL_PROXY_TOKEN should appear in proxy
    expect(content).toContain("CREDENTIAL_PROXY_TOKEN=");

    // Token should be a 64-char hex string (32 bytes)
    const tokenMatch = content.match(/CREDENTIAL_PROXY_TOKEN=([a-f0-9]+)/);
    expect(tokenMatch).toBeTruthy();
    expect(tokenMatch![1]).toMatch(/^[a-f0-9]{64}$/);
  });

  it("compose file has no API keys in agent environment", async () => {
    const { deps } = makeMockDeps({ sessionId: "nokeys01" });

    await runAgent(projectDir, "claude-code", "writer", deps);

    const composeFile = path.join(
      projectDir, ".clawmasons", "sessions", "nokeys01", "docker", "docker-compose.yml",
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

    await runAgent(projectDir, "claude-code", "writer", deps1);
    await runAgent(projectDir, "claude-code", "writer", deps2);

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

    await runAgent(projectDir, "claude-code", "writer", deps);

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("claude-code");
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

    await runAgent(projectDir, "claude-code", "writer", deps);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("agent failed");
    expect(errorOutput).toContain("Docker Compose");
  });

  it("exits 1 when proxy fails to start", async () => {
    const { deps } = makeMockDeps({ proxyExitCode: 1 });

    await runAgent(projectDir, "claude-code", "writer", deps);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("Failed to start proxy");
  });

  it("exits 1 when credential service fails to start", async () => {
    const { deps } = makeMockDeps({ credServiceExitCode: 1 });

    await runAgent(projectDir, "claude-code", "writer", deps);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("Failed to start credential service");
  });

  it("creates logs directory in session directory", async () => {
    const { deps } = makeMockDeps({ sessionId: "logs0001" });

    await runAgent(projectDir, "claude-code", "writer", deps);

    const logsDir = path.join(projectDir, ".clawmasons", "sessions", "logs0001", "logs");
    expect(fs.existsSync(logsDir)).toBe(true);
    expect(fs.statSync(logsDir).isDirectory()).toBe(true);
  });
});

// ── runProxyOnly ─────────────────────────────────────────────────────────

describe("runProxyOnly", () => {
  let tmpDir: string;
  let projectDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;

  function makeRoleType(overrides?: Partial<RoleType>): RoleType {
    return {
      metadata: { name: "role-writer", version: "1.0.0" },
      source: {
        agentDialect: "claude-code",
        agentDir: ".claude",
        roleDir: path.join(projectDir, ".claude", "roles", "writer"),
      },
      skills: [],
      commands: [],
      tools: [],
      apps: [],
      ...overrides,
    } as RoleType;
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-proxy-only-test-"));
    projectDir = path.join(tmpDir, "my-project");
    fs.mkdirSync(projectDir, { recursive: true });

    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    // Pre-create docker build dirs
    const dockerDir = path.join(projectDir, ".clawmasons", "docker");
    const dockerBuildDir = path.join(dockerDir, "writer");
    fs.mkdirSync(path.join(dockerBuildDir, "claude-code"), { recursive: true });
    fs.writeFileSync(path.join(dockerBuildDir, "claude-code", "Dockerfile"), "FROM node:20\n");
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
        resolveRoleFn: async () => makeRoleType(),
        ensureGitignoreEntryFn: () => false,
        existsSyncFn: (p: string) => fs.existsSync(p),
        execComposeFn: async (composeFile: string, args: string[]) => {
          calls.push({ composeFile, args });
          if (args.includes("build")) return overrides?.buildExitCode ?? 0;
          if (args.includes("-d")) return overrides?.upExitCode ?? 0;
          return 0;
        },
        startCredentialServiceFn: async () => ({ disconnect: () => {}, close: () => {} }),
      },
    };
  }

  it("builds proxy then starts it detached", async () => {
    const { calls, deps } = makeDeps();

    await runProxyOnly(projectDir, "claude-code", "writer", 19700, deps);

    expect(calls).toHaveLength(2);
    expect(calls[0]!.args).toContain("build");
    expect(calls[0]!.args).toContain("proxy-writer");
    expect(calls[1]!.args).toContain("up");
    expect(calls[1]!.args).toContain("-d");
    expect(calls[1]!.args).toContain("proxy-writer");
  });

  it("does NOT start agent or credential service", async () => {
    const { calls, deps } = makeDeps();

    await runProxyOnly(projectDir, "claude-code", "writer", 3000, deps);

    // Only 2 compose calls: build + up (no agent run, no down)
    expect(calls).toHaveLength(2);
    const allArgs = calls.flatMap((c) => c.args);
    expect(allArgs).not.toContain("agent-writer");
    expect(allArgs).not.toContain("--service-ports");
  });

  it("outputs JSON with connection info to stdout", async () => {
    const { deps } = makeDeps({ sessionId: "json0001" });

    await runProxyOnly(projectDir, "claude-code", "writer", 19700, deps);

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
      runProxyOnly(projectDir, "claude-code", "writer", 3000, deps),
    ).rejects.toThrow("Failed to build proxy image");
  });

  it("throws when proxy start fails", async () => {
    const { deps } = makeDeps({ upExitCode: 1 });

    await expect(
      runProxyOnly(projectDir, "claude-code", "writer", 3000, deps),
    ).rejects.toThrow("Failed to start proxy");
  });

  it("creates compose file with correct paths", async () => {
    const { deps } = makeDeps({ sessionId: "path0001" });

    await runProxyOnly(projectDir, "claude-code", "writer", 3000, deps);

    const composeFile = path.join(
      projectDir, ".clawmasons", "sessions", "path0001", "docker", "docker-compose.yml",
    );
    expect(fs.existsSync(composeFile)).toBe(true);

    const content = fs.readFileSync(composeFile, "utf-8");
    expect(content).toContain("proxy-writer:");
    expect(content).toContain("agent-writer:");
    expect(content).toContain(`"${projectDir}:/home/mason/workspace/project"`);
  });
});
