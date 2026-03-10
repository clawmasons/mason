import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  acpProxy,
  resolveAgentName,
  type AcpProxyDeps,
} from "../../src/cli/commands/acp-proxy.js";
import type { DiscoveredPackage, ResolvedAgent } from "@clawmasons/shared";
import type { AcpSessionConfig } from "../../src/acp/session.js";
import type { AcpBridge, AcpBridgeConfig } from "../../src/acp/bridge.js";
import type { AcpSession, SessionInfo } from "../../src/acp/session.js";

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

type MockBridgeType = Pick<AcpBridge, "start" | "connectToAgent" | "stop"> & {
  onClientConnect?: (() => void) | undefined;
  onClientDisconnect?: (() => void) | undefined;
  onAgentError?: ((error: Error) => void) | undefined;
};

function makeMockBridge() {
  let startCalled = false;
  let connectCalled = false;
  let stopCalled = false;

  const bridge: MockBridgeType = {
    start: async () => { startCalled = true; },
    connectToAgent: async () => { connectCalled = true; },
    stop: async () => { stopCalled = true; },
    onClientConnect: undefined,
    onClientDisconnect: undefined,
    onAgentError: undefined,
  };

  return {
    bridge,
    get startCalled() { return startCalled; },
    get connectCalled() { return connectCalled; },
    get stopCalled() { return stopCalled; },
  };
}

type MockSessionType = Pick<AcpSession, "start" | "stop" | "isRunning">;

function makeMockSession() {
  let startCalled = false;
  let stopCalled = false;

  const session: MockSessionType = {
    start: async (): Promise<SessionInfo> => {
      startCalled = true;
      return {
        sessionId: "test-session-01",
        sessionDir: "/fake/session/dir",
        composeFile: "/fake/compose.yml",
        acpPort: 3002,
        proxyServiceName: "proxy-test-role",
        agentServiceName: "agent-test-agent-test-role",
      };
    },
    stop: async () => { stopCalled = true; },
    isRunning: () => startCalled && !stopCalled,
  };

  return {
    session,
    get startCalled() { return startCalled; },
    get stopCalled() { return stopCalled; },
  };
}

function makeDeps(overrides?: {
  packages?: Map<string, DiscoveredPackage>;
  agent?: ResolvedAgent;
  bridge?: MockBridgeType;
  session?: MockSessionType;
}): AcpProxyDeps {
  const packages = overrides?.packages ?? new Map([
    ["test-agent", makeDiscoveredPackage("agent")],
  ]);
  const agent = overrides?.agent ?? makeResolvedAgent();
  const bridge = overrides?.bridge ?? makeMockBridge().bridge;
  const session = overrides?.session ?? makeMockSession().session;

  return {
    discoverPackagesFn: () => packages,
    resolveAgentFn: () => agent,
    createBridgeFn: () => bridge as unknown as AcpBridge,
    createSessionFn: () => session as unknown as AcpSession,
  };
}

// ── Command Registration ────────────────────────────────────────────────
// acp-proxy has been removed as a CLI entry point (REQ-007).
// Command registration tests are in build.test.ts (verifying removal).

// ── resolveAgentName ────────────────────────────────────────────────────

describe("resolveAgentName (acp-proxy)", () => {
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

// ── acpProxy ────────────────────────────────────────────────────────────

describe("acpProxy", () => {
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

    const deps: AcpProxyDeps = {
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

    await acpProxy("/fake/root", { role: "test-role" }, deps);

    expect(discoveredRoot).toBe("/fake/root");
    expect(resolvedName).toBe("test-agent");
  });

  it("starts the bridge on the configured port", async () => {
    let bridgeConfig: AcpBridgeConfig | undefined;

    const deps: AcpProxyDeps = {
      ...makeDeps(),
      createBridgeFn: (config: AcpBridgeConfig) => {
        bridgeConfig = config;
        return makeMockBridge().bridge as unknown as AcpBridge;
      },
    };

    await acpProxy("/fake/root", { role: "test-role", port: 4001 }, deps);

    expect(bridgeConfig?.hostPort).toBe(4001);
    expect(bridgeConfig?.containerPort).toBe(3002);
  });

  it("starts the Docker session", async () => {
    const mockSession = makeMockSession();
    const deps = makeDeps({ session: mockSession.session });

    await acpProxy("/fake/root", { role: "test-role" }, deps);

    expect(mockSession.startCalled).toBe(true);
  });

  it("connects bridge to agent after session starts", async () => {
    const mockBridge = makeMockBridge();
    const deps = makeDeps({ bridge: mockBridge.bridge });

    await acpProxy("/fake/root", { role: "test-role" }, deps);

    expect(mockBridge.startCalled).toBe(true);
    expect(mockBridge.connectCalled).toBe(true);
  });

  it("logs ready message with port info", async () => {
    const deps = makeDeps();

    await acpProxy("/fake/root", { role: "test-role", port: 3001 }, deps);

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("Ready");
    expect(logOutput).toContain("3001");
  });

  it("uses default port 3001 when not specified", async () => {
    let bridgeConfig: AcpBridgeConfig | undefined;

    const deps: AcpProxyDeps = {
      ...makeDeps(),
      createBridgeFn: (config: AcpBridgeConfig) => {
        bridgeConfig = config;
        return makeMockBridge().bridge as unknown as AcpBridge;
      },
    };

    await acpProxy("/fake/root", { role: "test-role" }, deps);

    expect(bridgeConfig?.hostPort).toBe(3001);
  });

  it("passes role and agent to session config", async () => {
    let sessionConfig: AcpSessionConfig | undefined;

    const deps: AcpProxyDeps = {
      ...makeDeps(),
      createSessionFn: (config: AcpSessionConfig) => {
        sessionConfig = config;
        return makeMockSession().session as unknown as AcpSession;
      },
    };

    await acpProxy("/fake/root", { role: "my-role", agent: "my-agent" }, deps);

    expect(sessionConfig?.role).toBe("my-role");
    expect(sessionConfig?.agent).toBe("my-agent");
    expect(sessionConfig?.projectDir).toBe("/fake/root");
  });

  it("exits 1 when no agents found", async () => {
    const deps: AcpProxyDeps = {
      ...makeDeps(),
      discoverPackagesFn: () => new Map(),
    };

    await acpProxy("/fake/root", { role: "test-role" }, deps);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("No agent packages found");
  });

  it("exits 1 when session fails to start", async () => {
    const failingSession: MockSessionType = {
      start: async () => { throw new Error("Docker compose failed"); },
      stop: async () => {},
      isRunning: () => false,
    };

    const deps = makeDeps({ session: failingSession });

    await acpProxy("/fake/root", { role: "test-role" }, deps);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("Docker compose failed");
  });

  it("exits 1 when bridge fails to connect to agent", async () => {
    const failingBridge: MockBridgeType = {
      start: async () => {},
      connectToAgent: async () => { throw new Error("Agent unreachable"); },
      stop: async () => {},
      onClientConnect: undefined,
      onClientDisconnect: undefined,
      onAgentError: undefined,
    };

    const deps = makeDeps({ bridge: failingBridge });

    await acpProxy("/fake/root", { role: "test-role" }, deps);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("Agent unreachable");
  });

  it("cleans up bridge and session on startup failure", async () => {
    const mockBridge = makeMockBridge();
    const mockSession = makeMockSession();

    // Make connectToAgent fail after session started
    const bridge: MockBridgeType = {
      ...mockBridge.bridge,
      connectToAgent: async () => { throw new Error("Connection refused"); },
    };

    const deps = makeDeps({
      bridge,
      session: mockSession.session,
    });

    await acpProxy("/fake/root", { role: "test-role" }, deps);

    expect(exitSpy).toHaveBeenCalledWith(1);
    // Bridge and session should have been cleaned up
    expect(mockBridge.stopCalled).toBe(true);
    expect(mockSession.stopCalled).toBe(true);
  });

  it("sets onClientConnect callback on bridge", async () => {
    const mockBridge = makeMockBridge();
    const deps = makeDeps({ bridge: mockBridge.bridge });

    await acpProxy("/fake/root", { role: "test-role" }, deps);

    expect(mockBridge.bridge.onClientConnect).toBeDefined();
  });

  it("sets onClientDisconnect callback on bridge", async () => {
    const mockBridge = makeMockBridge();
    const deps = makeDeps({ bridge: mockBridge.bridge });

    await acpProxy("/fake/root", { role: "test-role" }, deps);

    expect(mockBridge.bridge.onClientDisconnect).toBeDefined();
  });

  it("sets onAgentError callback on bridge", async () => {
    const mockBridge = makeMockBridge();
    const deps = makeDeps({ bridge: mockBridge.bridge });

    await acpProxy("/fake/root", { role: "test-role" }, deps);

    expect(mockBridge.bridge.onAgentError).toBeDefined();
  });

  it("logs session ID after session starts", async () => {
    const deps = makeDeps();

    await acpProxy("/fake/root", { role: "test-role" }, deps);

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("test-session-01");
  });

  it("uses --agent flag for agent name", async () => {
    let resolvedName: string | undefined;

    const deps: AcpProxyDeps = {
      ...makeDeps(),
      resolveAgentFn: (name: string) => {
        resolvedName = name;
        return makeResolvedAgent(name);
      },
    };

    await acpProxy("/fake/root", { role: "test-role", agent: "custom-agent" }, deps);

    expect(resolvedName).toBe("custom-agent");
  });

  it("passes proxy port to session config", async () => {
    let sessionConfig: AcpSessionConfig | undefined;

    const deps: AcpProxyDeps = {
      ...makeDeps(),
      createSessionFn: (config: AcpSessionConfig) => {
        sessionConfig = config;
        return makeMockSession().session as unknown as AcpSession;
      },
    };

    await acpProxy("/fake/root", { role: "test-role", proxyPort: 4000 }, deps);

    expect(sessionConfig?.proxyPort).toBe(4000);
  });
});
