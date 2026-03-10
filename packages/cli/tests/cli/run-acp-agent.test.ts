import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Command } from "commander";
import {
  runAcpAgent,
  resolveAgentName,
  registerRunAcpAgentCommand,
  RUN_ACP_AGENT_HELP_EPILOG,
  type RunAcpAgentDeps,
} from "../../src/cli/commands/run-acp-agent.js";
import type { DiscoveredPackage, ResolvedAgent } from "@clawmasons/shared";
import type { AcpSessionConfig, InfrastructureInfo, AgentSessionInfo } from "../../src/acp/session.js";
import type { AcpBridge, AcpBridgeConfig } from "../../src/acp/bridge.js";
import type { AcpSession } from "../../src/acp/session.js";
import type { ChapterEntry } from "../../src/runtime/home.js";

// ── Test Fixtures ────────────────────────────────────────────────────

function makeDiscoveredPackage(type: "agent" | "app" | "role"): DiscoveredPackage {
  return {
    name: `test-${type}`,
    version: "1.0.0",
    packagePath: `/fake/packages/${type}`,
    chapterField: { type } as DiscoveredPackage["chapterField"],
  };
}

function makeResolvedAgent(name = "test-agent"): ResolvedAgent {
  return {
    name,
    version: "1.0.0",
    agentName: name,
    slug: name,
    runtimes: ["claude-code"],
    credentials: [],
    roles: [
      {
        name: "test-role",
        version: "1.0.0",
        risk: "LOW" as const,
        permissions: { github: { allow: ["*"], deny: [] } },
        tasks: [],
        skills: [],
        apps: [
          {
            name: "@test/app-github",
            version: "1.0.0",
            transport: "stdio" as const,
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            tools: [],
            capabilities: [],
            credentials: ["GITHUB_TOKEN"],
          },
        ],
      },
    ],
  };
}

type MockBridgeType = Pick<AcpBridge, "start" | "connectToAgent" | "stop" | "resetForNewSession"> & {
  onClientConnect?: (() => void) | undefined;
  onClientDisconnect?: (() => void) | undefined;
  onAgentError?: ((error: Error) => void) | undefined;
  onSessionNew?: ((cwd: string) => Promise<void>) | undefined;
};

function makeMockBridge() {
  let startCalled = false;
  let connectCalled = false;
  let stopCalled = false;
  let resetCalled = false;

  const bridge: MockBridgeType = {
    start: async () => { startCalled = true; },
    connectToAgent: async () => { connectCalled = true; },
    stop: async () => { stopCalled = true; },
    resetForNewSession: () => { resetCalled = true; },
    onClientConnect: undefined,
    onClientDisconnect: undefined,
    onAgentError: undefined,
    onSessionNew: undefined,
  };

  return {
    bridge,
    get startCalled() { return startCalled; },
    get connectCalled() { return connectCalled; },
    get stopCalled() { return stopCalled; },
    get resetCalled() { return resetCalled; },
  };
}

type MockSessionType = Pick<AcpSession, "start" | "stop" | "isRunning" | "startInfrastructure" | "startAgent" | "stopAgent" | "isInfrastructureRunning" | "isAgentRunning">;

function makeMockSession() {
  let startInfraCalled = false;
  let startAgentCalled = false;
  let stopAgentCalled = false;
  let stopCalled = false;
  let agentProjectDir: string | undefined;

  const infraInfo: InfrastructureInfo = {
    sessionId: "infra-session-01",
    sessionDir: "/fake/infra/dir",
    composeFile: "/fake/infra-compose.yml",
    proxyServiceName: "proxy-test-role",
    proxyToken: "fake-proxy-token",
    credentialProxyToken: "fake-cred-token",
    dockerBuildPath: "/fake/docker-build",
  };

  const agentInfo: AgentSessionInfo = {
    sessionId: "agent-session-01",
    sessionDir: "/fake/agent/dir",
    composeFile: "/fake/agent-compose.yml",
    acpPort: 3002,
    agentServiceName: "agent-test-agent-test-role",
    projectDir: "/fake/project",
  };

  const session: MockSessionType = {
    start: async () => {
      throw new Error("Legacy start() should not be called in deferred mode");
    },
    stop: async () => { stopCalled = true; },
    isRunning: () => false,
    startInfrastructure: async (): Promise<InfrastructureInfo> => {
      startInfraCalled = true;
      return infraInfo;
    },
    startAgent: async (projectDir: string): Promise<AgentSessionInfo> => {
      startAgentCalled = true;
      agentProjectDir = projectDir;
      return { ...agentInfo, projectDir };
    },
    stopAgent: async () => { stopAgentCalled = true; },
    isInfrastructureRunning: () => startInfraCalled,
    isAgentRunning: () => startAgentCalled && !stopAgentCalled,
  };

  return {
    session,
    get startInfraCalled() { return startInfraCalled; },
    get startAgentCalled() { return startAgentCalled; },
    get stopAgentCalled() { return stopAgentCalled; },
    get stopCalled() { return stopCalled; },
    get agentProjectDir() { return agentProjectDir; },
  };
}

function makeRoleEntry(overrides?: Partial<ChapterEntry>): ChapterEntry {
  return {
    lodge: "test-lodge",
    chapter: "test-chapter",
    role: "test-role",
    dockerBuild: "/fake/docker-build",
    roleDir: "/fake/role-dir",
    agents: ["test-agent"],
    createdAt: "2026-03-10T00:00:00Z",
    updatedAt: "2026-03-10T00:00:00Z",
    ...overrides,
  };
}

function makeDeps(overrides?: {
  packages?: Map<string, DiscoveredPackage>;
  agent?: ResolvedAgent;
  bridge?: MockBridgeType;
  session?: MockSessionType;
  roleEntry?: ChapterEntry | undefined;
  initRoleCalled?: { value: boolean };
}): RunAcpAgentDeps {
  const packages = overrides?.packages ?? new Map([
    ["test-agent", makeDiscoveredPackage("agent")],
  ]);
  const agent = overrides?.agent ?? makeResolvedAgent();
  const bridge = overrides?.bridge ?? makeMockBridge().bridge;
  const session = overrides?.session ?? makeMockSession().session;
  const roleEntry = overrides && "roleEntry" in overrides ? overrides.roleEntry : makeRoleEntry();

  return {
    discoverPackagesFn: () => packages,
    resolveAgentFn: () => agent,
    createBridgeFn: () => bridge as unknown as AcpBridge,
    createSessionFn: () => session as unknown as AcpSession,
    getClawmasonsHomeFn: () => "/fake/clawmasons-home",
    findRoleEntryByRoleFn: () => roleEntry,
    initRoleFn: async () => {
      if (overrides?.initRoleCalled) overrides.initRoleCalled.value = true;
    },
    ensureGitignoreEntryFn: () => false,
    mkdirSyncFn: () => {},
  };
}

// ── resolveAgentName ────────────────────────────────────────────────────

describe("resolveAgentName (run-acp-agent)", () => {
  it("returns agent flag when provided", () => {
    const packages = new Map<string, DiscoveredPackage>();
    expect(resolveAgentName("my-agent", packages)).toBe("my-agent");
  });

  it("auto-detects single agent", () => {
    const packages = new Map<string, DiscoveredPackage>([
      ["my-agent", makeDiscoveredPackage("agent")],
      ["my-app", makeDiscoveredPackage("app")],
    ]);
    expect(resolveAgentName(undefined, packages)).toBe("my-agent");
  });

  it("throws when no agents found", () => {
    const packages = new Map<string, DiscoveredPackage>([
      ["my-app", makeDiscoveredPackage("app")],
    ]);
    expect(() => resolveAgentName(undefined, packages)).toThrow("No agent packages found");
  });

  it("throws when multiple agents found without flag", () => {
    const agent1 = makeDiscoveredPackage("agent");
    const agent2 = makeDiscoveredPackage("agent");
    const packages = new Map<string, DiscoveredPackage>([
      ["agent-1", agent1],
      ["agent-2", agent2],
    ]);
    expect(() => resolveAgentName(undefined, packages)).toThrow("Multiple agent packages");
  });
});

// ── runAcpAgent ────────────────────────────────────────────────────────────

describe("runAcpAgent", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => { /* noop */ }) as never) as unknown as ReturnType<typeof vi.spyOn>;
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("discovers packages and resolves agent", async () => {
    let discoveredRoot: string | undefined;
    let resolvedName: string | undefined;

    const deps: RunAcpAgentDeps = {
      ...makeDeps(),
      discoverPackagesFn: (rootDir: string) => {
        discoveredRoot = rootDir;
        return new Map([["test-agent", makeDiscoveredPackage("agent")]]);
      },
      resolveAgentFn: (name: string) => {
        resolvedName = name;
        return makeResolvedAgent();
      },
    };

    await runAcpAgent("/fake/root", { role: "test-role" }, deps);

    expect(discoveredRoot).toBe("/fake/root");
    expect(resolvedName).toBe("test-agent");
  });

  it("starts the bridge on the configured port", async () => {
    let bridgeConfig: AcpBridgeConfig | undefined;

    const deps: RunAcpAgentDeps = {
      ...makeDeps(),
      createBridgeFn: (config: AcpBridgeConfig) => {
        bridgeConfig = config;
        return makeMockBridge().bridge as unknown as AcpBridge;
      },
    };

    await runAcpAgent("/fake/root", { role: "test-role", port: 4001 }, deps);

    expect(bridgeConfig?.hostPort).toBe(4001);
    expect(bridgeConfig?.containerPort).toBe(3002);
  });

  it("starts infrastructure (not full session) on startup", async () => {
    const mockSession = makeMockSession();
    const deps = makeDeps({ session: mockSession.session });

    await runAcpAgent("/fake/root", { role: "test-role" }, deps);

    expect(mockSession.startInfraCalled).toBe(true);
    // Agent should NOT be started yet (deferred to session/new)
    expect(mockSession.startAgentCalled).toBe(false);
  });

  it("starts bridge but does NOT connect to agent on startup", async () => {
    const mockBridge = makeMockBridge();
    const deps = makeDeps({ bridge: mockBridge.bridge });

    await runAcpAgent("/fake/root", { role: "test-role" }, deps);

    expect(mockBridge.startCalled).toBe(true);
    // connectToAgent is deferred to onSessionNew callback
    expect(mockBridge.connectCalled).toBe(false);
  });

  it("logs ready message with port info and deferred mode", async () => {
    const deps = makeDeps();

    await runAcpAgent("/fake/root", { role: "test-role", port: 3001 }, deps);

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("Ready");
    expect(logOutput).toContain("3001");
    expect(logOutput).toContain("deferred");
  });

  it("uses default port 3001 when not specified", async () => {
    let bridgeConfig: AcpBridgeConfig | undefined;

    const deps: RunAcpAgentDeps = {
      ...makeDeps(),
      createBridgeFn: (config: AcpBridgeConfig) => {
        bridgeConfig = config;
        return makeMockBridge().bridge as unknown as AcpBridge;
      },
    };

    await runAcpAgent("/fake/root", { role: "test-role" }, deps);

    expect(bridgeConfig?.hostPort).toBe(3001);
  });

  it("passes role and agent to session config", async () => {
    let sessionConfig: AcpSessionConfig | undefined;

    const deps: RunAcpAgentDeps = {
      ...makeDeps(),
      createSessionFn: (config: AcpSessionConfig) => {
        sessionConfig = config;
        return makeMockSession().session as unknown as AcpSession;
      },
    };

    await runAcpAgent("/fake/root", { role: "my-role", agent: "my-agent" }, deps);

    expect(sessionConfig?.role).toBe("my-role");
    expect(sessionConfig?.agent).toBe("my-agent");
    expect(sessionConfig?.projectDir).toBe("/fake/root");
  });

  it("exits 1 when no agents found", async () => {
    const deps: RunAcpAgentDeps = {
      ...makeDeps(),
      discoverPackagesFn: () => new Map(),
    };

    await runAcpAgent("/fake/root", { role: "test-role" }, deps);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("No agent packages found");
  });

  it("exits 1 when infrastructure fails to start", async () => {
    const failingSession: MockSessionType = {
      start: async () => { throw new Error("should not be called"); },
      stop: async () => {},
      isRunning: () => false,
      startInfrastructure: async () => { throw new Error("Docker compose failed"); },
      startAgent: async () => { throw new Error("should not be called"); },
      stopAgent: async () => {},
      isInfrastructureRunning: () => false,
      isAgentRunning: () => false,
    };

    const deps = makeDeps({ session: failingSession });

    await runAcpAgent("/fake/root", { role: "test-role" }, deps);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("Docker compose failed");
  });

  it("cleans up bridge and session on startup failure", async () => {
    const mockBridge = makeMockBridge();
    const mockSession = makeMockSession();

    // Make startInfrastructure fail
    const failingSession: MockSessionType = {
      ...mockSession.session,
      startInfrastructure: async () => { throw new Error("Infra failed"); },
    };

    const deps = makeDeps({
      bridge: mockBridge.bridge,
      session: failingSession,
    });

    await runAcpAgent("/fake/root", { role: "test-role" }, deps);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockSession.stopCalled).toBe(true);
  });

  it("sets onClientConnect callback on bridge", async () => {
    const mockBridge = makeMockBridge();
    const deps = makeDeps({ bridge: mockBridge.bridge });

    await runAcpAgent("/fake/root", { role: "test-role" }, deps);

    expect(mockBridge.bridge.onClientConnect).toBeDefined();
  });

  it("sets onClientDisconnect callback on bridge", async () => {
    const mockBridge = makeMockBridge();
    const deps = makeDeps({ bridge: mockBridge.bridge });

    await runAcpAgent("/fake/root", { role: "test-role" }, deps);

    expect(mockBridge.bridge.onClientDisconnect).toBeDefined();
  });

  it("sets onAgentError callback on bridge", async () => {
    const mockBridge = makeMockBridge();
    const deps = makeDeps({ bridge: mockBridge.bridge });

    await runAcpAgent("/fake/root", { role: "test-role" }, deps);

    expect(mockBridge.bridge.onAgentError).toBeDefined();
  });

  it("sets onSessionNew callback on bridge", async () => {
    const mockBridge = makeMockBridge();
    const deps = makeDeps({ bridge: mockBridge.bridge });

    await runAcpAgent("/fake/root", { role: "test-role" }, deps);

    expect(mockBridge.bridge.onSessionNew).toBeDefined();
  });

  it("logs infrastructure session ID after startup", async () => {
    const deps = makeDeps();

    await runAcpAgent("/fake/root", { role: "test-role" }, deps);

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("infra-session-01");
  });

  it("uses --agent flag for agent name", async () => {
    let resolvedName: string | undefined;

    const deps: RunAcpAgentDeps = {
      ...makeDeps(),
      resolveAgentFn: (name: string) => {
        resolvedName = name;
        return makeResolvedAgent(name);
      },
    };

    await runAcpAgent("/fake/root", { role: "test-role", agent: "custom-agent" }, deps);

    expect(resolvedName).toBe("custom-agent");
  });

  it("passes proxy port to session config", async () => {
    let sessionConfig: AcpSessionConfig | undefined;

    const deps: RunAcpAgentDeps = {
      ...makeDeps(),
      createSessionFn: (config: AcpSessionConfig) => {
        sessionConfig = config;
        return makeMockSession().session as unknown as AcpSession;
      },
    };

    await runAcpAgent("/fake/root", { role: "test-role", proxyPort: 4000 }, deps);

    expect(sessionConfig?.proxyPort).toBe(4000);
  });

  // ── CLAWMASONS_HOME + auto-init tests ──────────────────────────────

  it("reads role from CLAWMASONS_HOME on startup", async () => {
    let homePassed: string | undefined;
    let rolePassed: string | undefined;

    const deps: RunAcpAgentDeps = {
      ...makeDeps(),
      getClawmasonsHomeFn: () => "/custom/home",
      findRoleEntryByRoleFn: (home: string, role: string) => {
        homePassed = home;
        rolePassed = role;
        return makeRoleEntry();
      },
    };

    await runAcpAgent("/fake/root", { role: "writer" }, deps);

    expect(homePassed).toBe("/custom/home");
    expect(rolePassed).toBe("writer");
  });

  it("auto-invokes init-role when role not found", async () => {
    const initRoleCalled = { value: false };
    let callCount = 0;

    const deps: RunAcpAgentDeps = {
      ...makeDeps({ initRoleCalled }),
      findRoleEntryByRoleFn: () => {
        callCount++;
        // First call: not found; second call (after init): found
        if (callCount === 1) return undefined;
        return makeRoleEntry();
      },
    };

    await runAcpAgent("/fake/root", { role: "writer" }, deps);

    expect(initRoleCalled.value).toBe(true);
  });

  it("exits 1 when auto-init fails to create role entry", async () => {
    const deps: RunAcpAgentDeps = {
      ...makeDeps({ roleEntry: undefined }),
    };

    await runAcpAgent("/fake/root", { role: "writer" }, deps);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("auto-init failed");
  });

  it("calls ensureGitignoreEntry for .clawmasons on chapter workspace", async () => {
    let gitignoreDir: string | undefined;
    let gitignorePattern: string | undefined;

    const deps: RunAcpAgentDeps = {
      ...makeDeps(),
      ensureGitignoreEntryFn: (dir: string, pattern: string) => {
        gitignoreDir = dir;
        gitignorePattern = pattern;
        return false;
      },
    };

    await runAcpAgent("/fake/root", { role: "test-role" }, deps);

    expect(gitignoreDir).toBe("/fake/root");
    expect(gitignorePattern).toBe(".clawmasons");
  });

  it("uses run-acp-agent prefix in log messages", async () => {
    const deps = makeDeps();

    await runAcpAgent("/fake/root", { role: "test-role" }, deps);

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("[chapter run-acp-agent]");
    expect(logOutput).not.toContain("[chapter acp-proxy]");
  });

  // ── onSessionNew callback tests ──────────────────────────────────────

  it("onSessionNew callback starts agent and connects bridge", async () => {
    const mockBridge = makeMockBridge();
    const mockSession = makeMockSession();
    const deps = makeDeps({ bridge: mockBridge.bridge, session: mockSession.session });

    await runAcpAgent("/fake/root", { role: "test-role" }, deps);

    // Simulate session/new arriving
    expect(mockBridge.bridge.onSessionNew).toBeDefined();
    await mockBridge.bridge.onSessionNew!("/projects/myapp");

    expect(mockSession.startAgentCalled).toBe(true);
    expect(mockSession.agentProjectDir).toBe("/projects/myapp");
    expect(mockBridge.connectCalled).toBe(true);
  });

  it("onSessionNew creates .clawmasons directory in cwd", async () => {
    const mockBridge = makeMockBridge();
    const mkdirCalls: Array<{ path: string; recursive: boolean }> = [];

    const deps: RunAcpAgentDeps = {
      ...makeDeps({ bridge: mockBridge.bridge }),
      mkdirSyncFn: (dirPath: string, opts?: { recursive?: boolean }) => {
        mkdirCalls.push({ path: dirPath, recursive: opts?.recursive ?? false });
      },
    };

    await runAcpAgent("/fake/root", { role: "test-role" }, deps);
    await mockBridge.bridge.onSessionNew!("/projects/myapp");

    expect(mkdirCalls).toContainEqual({
      path: "/projects/myapp/.clawmasons",
      recursive: true,
    });
  });

  it("onSessionNew ensures .gitignore in cwd directory", async () => {
    const mockBridge = makeMockBridge();
    const gitignoreCalls: Array<{ dir: string; pattern: string }> = [];

    const deps: RunAcpAgentDeps = {
      ...makeDeps({ bridge: mockBridge.bridge }),
      ensureGitignoreEntryFn: (dir: string, pattern: string) => {
        gitignoreCalls.push({ dir, pattern });
        return false;
      },
    };

    await runAcpAgent("/fake/root", { role: "test-role" }, deps);
    await mockBridge.bridge.onSessionNew!("/projects/myapp");

    // Should have two calls: one for rootDir on startup, one for cwd on session/new
    expect(gitignoreCalls).toContainEqual({ dir: "/projects/myapp", pattern: ".clawmasons" });
  });

  it("onClientDisconnect stops agent but not infrastructure", async () => {
    const mockBridge = makeMockBridge();
    const mockSession = makeMockSession();
    const deps = makeDeps({ bridge: mockBridge.bridge, session: mockSession.session });

    await runAcpAgent("/fake/root", { role: "test-role" }, deps);

    // Start an agent first
    await mockBridge.bridge.onSessionNew!("/projects/myapp");

    // Trigger disconnect
    mockBridge.bridge.onClientDisconnect!();

    // Wait for async disconnect handler
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockSession.stopAgentCalled).toBe(true);
    expect(mockSession.stopCalled).toBe(false); // Infrastructure stays up
    expect(mockBridge.resetCalled).toBe(true);
  });
});

// ── Help Text ─────────────────────────────────────────────────────────────

describe("run-acp-agent help text", () => {
  function getHelpOutput(): string {
    const program = new Command();
    registerRunAcpAgentCommand(program);
    const cmd = program.commands.find((c) => c.name() === "run-acp-agent");
    expect(cmd).toBeDefined();
    let output = "";
    cmd!.configureOutput({ writeOut: (str: string) => { output += str; } });
    cmd!.outputHelp();
    return output;
  }

  it("contains session/new CWD behavior explanation", () => {
    const help = getHelpOutput();
    expect(help).toContain("session/new");
    expect(help).toContain("cwd");
    expect(help).toContain("/workspace");
  });

  it("contains .clawmasons/ creation notice", () => {
    const help = getHelpOutput();
    expect(help).toContain(".clawmasons/");
    expect(help).toContain("session logs");
  });

  it("contains .gitignore management notice", () => {
    const help = getHelpOutput();
    expect(help).toContain(".gitignore");
  });

  it("contains CLAWMASONS_HOME documentation", () => {
    const help = getHelpOutput();
    expect(help).toContain("CLAWMASONS_HOME");
    expect(help).toContain("~/.clawmasons");
  });

  it("contains ACP client configuration example", () => {
    const help = getHelpOutput();
    expect(help).toContain("mcpServers");
    expect(help).toContain("run-acp-agent");
    expect(help).toContain("--role");
  });

  it("exports the help epilog as a constant", () => {
    expect(RUN_ACP_AGENT_HELP_EPILOG).toContain("Session Behavior");
    expect(RUN_ACP_AGENT_HELP_EPILOG).toContain("Side Effects");
    expect(RUN_ACP_AGENT_HELP_EPILOG).toContain("Environment");
    expect(RUN_ACP_AGENT_HELP_EPILOG).toContain("ACP Client Configuration Example");
  });
});
