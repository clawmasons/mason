import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { program } from "../../src/cli/index.js";

// ── Mock all heavy dependencies ──────────────────────────────────────

vi.mock("../../src/resolver/discover.js", () => ({
  discoverPackages: vi.fn(),
}));

vi.mock("../../src/resolver/resolve.js", () => ({
  resolveAgent: vi.fn(),
}));

vi.mock("../../src/generator/toolfilter.js", () => ({
  computeToolFilters: vi.fn(() => new Map()),
  getAppShortName: vi.fn((name: string) => name.split("/").pop()?.replace("app-", "") ?? name),
}));

vi.mock("../../src/proxy/credentials.js", () => ({
  loadEnvFile: vi.fn(() => ({})),
  resolveEnvVars: vi.fn((env: Record<string, string>) => env),
}));

vi.mock("../../src/proxy/db.js", () => ({
  openDatabase: vi.fn(() => ({
    close: vi.fn(),
  })),
}));

vi.mock("../../src/proxy/upstream.js", () => ({
  UpstreamManager: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    getTools: vi.fn(async () => []),
    getResources: vi.fn(async () => []),
    getPrompts: vi.fn(async () => []),
    shutdown: vi.fn(),
  })),
}));

vi.mock("../../src/proxy/router.js", () => ({
  ToolRouter: vi.fn().mockImplementation(() => ({
    listTools: vi.fn(() => []),
    resolve: vi.fn(() => null),
  })),
  ResourceRouter: vi.fn().mockImplementation(() => ({
    listResources: vi.fn(() => []),
    resolveUri: vi.fn(() => null),
  })),
  PromptRouter: vi.fn().mockImplementation(() => ({
    listPrompts: vi.fn(() => []),
    resolve: vi.fn(() => null),
  })),
}));

vi.mock("../../src/proxy/server.js", () => ({
  ForgeProxyServer: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
}));

// ── Command Registration Tests ──────────────────────────────────────

describe("forge proxy command", () => {
  it("is registered on the program", () => {
    const proxyCmd = program.commands.find((cmd) => cmd.name() === "proxy");
    expect(proxyCmd).toBeDefined();
  });

  it("has a description", () => {
    const proxyCmd = program.commands.find((cmd) => cmd.name() === "proxy");
    expect(proxyCmd?.description()).toContain("proxy");
  });

  it("has --port option", () => {
    const proxyCmd = program.commands.find((cmd) => cmd.name() === "proxy");
    const opt = proxyCmd?.options.find((o) => o.long === "--port");
    expect(opt).toBeDefined();
  });

  it("has --startup-timeout option", () => {
    const proxyCmd = program.commands.find((cmd) => cmd.name() === "proxy");
    const opt = proxyCmd?.options.find((o) => o.long === "--startup-timeout");
    expect(opt).toBeDefined();
  });

  it("has --agent option", () => {
    const proxyCmd = program.commands.find((cmd) => cmd.name() === "proxy");
    const opt = proxyCmd?.options.find((o) => o.long === "--agent");
    expect(opt).toBeDefined();
  });
});

// ── startProxy Unit Tests ──────────────────────────────────────────────

import { startProxy } from "../../src/cli/commands/proxy.js";
import { discoverPackages } from "../../src/resolver/discover.js";
import { resolveAgent } from "../../src/resolver/resolve.js";
import { computeToolFilters } from "../../src/generator/toolfilter.js";
import { UpstreamManager } from "../../src/proxy/upstream.js";
import { ForgeProxyServer } from "../../src/proxy/server.js";
import type { DiscoveredPackage, ResolvedAgent } from "../../src/resolver/types.js";

function makeAgent(name: string): ResolvedAgent {
  return {
    name,
    version: "1.0.0",
    runtimes: ["claude-code"],
    roles: [
      {
        name: "@test/role-dev",
        version: "1.0.0",
        permissions: {
          "@test/app-github": { allow: ["create_pr"], deny: [] },
        },
        tasks: [],
        apps: [
          {
            name: "@test/app-github",
            version: "1.0.0",
            transport: "stdio" as const,
            command: "node",
            args: ["server.js"],
            env: { GITHUB_TOKEN: "${GITHUB_TOKEN}" },
            tools: ["create_pr"],
            capabilities: ["github"],
          },
        ],
        skills: [],
      },
    ],
    proxy: { port: 9090, type: "sse" },
  };
}

function makePackages(agentName: string): Map<string, DiscoveredPackage> {
  const map = new Map<string, DiscoveredPackage>();
  map.set(agentName, {
    name: agentName,
    version: "1.0.0",
    packagePath: "/fake/path",
    forgeField: {
      type: "agent",
      runtimes: ["claude-code"],
      roles: ["@test/role-dev"],
    },
  });
  return map;
}

describe("startProxy", () => {
  const originalExit = process.exit;

  beforeEach(() => {
    vi.clearAllMocks();
    // Prevent process.exit from actually exiting
    process.exit = vi.fn() as never;
  });

  afterEach(() => {
    process.exit = originalExit;
  });

  it("fails with no agents found", async () => {
    vi.mocked(discoverPackages).mockReturnValue(new Map());

    await startProxy("/fake/root", {});

    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("fails with multiple agents and no --agent flag", async () => {
    const packages = new Map<string, DiscoveredPackage>();
    packages.set("@test/agent-a", {
      name: "@test/agent-a",
      version: "1.0.0",
      packagePath: "/fake/a",
      forgeField: { type: "agent", runtimes: ["claude-code"], roles: ["@test/role"] },
    });
    packages.set("@test/agent-b", {
      name: "@test/agent-b",
      version: "1.0.0",
      packagePath: "/fake/b",
      forgeField: { type: "agent", runtimes: ["claude-code"], roles: ["@test/role"] },
    });
    vi.mocked(discoverPackages).mockReturnValue(packages);

    await startProxy("/fake/root", {});

    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("auto-detects single agent", async () => {
    const agentName = "@test/agent-note-taker";
    vi.mocked(discoverPackages).mockReturnValue(makePackages(agentName));
    vi.mocked(resolveAgent).mockReturnValue(makeAgent(agentName));
    vi.mocked(computeToolFilters).mockReturnValue(new Map());

    await startProxy("/fake/root", {});

    expect(resolveAgent).toHaveBeenCalledWith(agentName, expect.any(Map));
    expect(ForgeProxyServer).toHaveBeenCalled();
  });

  it("uses --agent flag to select agent", async () => {
    const agentName = "@test/agent-specific";
    vi.mocked(discoverPackages).mockReturnValue(makePackages(agentName));
    vi.mocked(resolveAgent).mockReturnValue(makeAgent(agentName));
    vi.mocked(computeToolFilters).mockReturnValue(new Map());

    await startProxy("/fake/root", { agent: agentName });

    expect(resolveAgent).toHaveBeenCalledWith(agentName, expect.any(Map));
  });

  it("passes --port to server config", async () => {
    const agentName = "@test/agent-port";
    vi.mocked(discoverPackages).mockReturnValue(makePackages(agentName));
    vi.mocked(resolveAgent).mockReturnValue(makeAgent(agentName));
    vi.mocked(computeToolFilters).mockReturnValue(new Map());

    await startProxy("/fake/root", { agent: agentName, port: "8080" });

    expect(ForgeProxyServer).toHaveBeenCalledWith(
      expect.objectContaining({ port: 8080 }),
    );
  });

  it("passes --startup-timeout to upstream initialize", async () => {
    const agentName = "@test/agent-timeout";
    vi.mocked(discoverPackages).mockReturnValue(makePackages(agentName));
    vi.mocked(resolveAgent).mockReturnValue(makeAgent(agentName));
    vi.mocked(computeToolFilters).mockReturnValue(new Map());

    await startProxy("/fake/root", { agent: agentName, startupTimeout: "30" });

    const mockUpstreamInstance = vi.mocked(UpstreamManager).mock.results[0]?.value;
    expect(mockUpstreamInstance.initialize).toHaveBeenCalledWith(30000);
  });

  it("creates upstream configs with resolved env vars", async () => {
    const agentName = "@test/agent-env";
    vi.mocked(discoverPackages).mockReturnValue(makePackages(agentName));
    vi.mocked(resolveAgent).mockReturnValue(makeAgent(agentName));
    vi.mocked(computeToolFilters).mockReturnValue(new Map());

    await startProxy("/fake/root", { agent: agentName });

    expect(UpstreamManager).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: "@test/app-github",
          env: expect.any(Object),
        }),
      ]),
    );
  });

  it("collects approval patterns from roles", async () => {
    const agentName = "@test/agent-approval";
    const agent = makeAgent(agentName);
    agent.roles[0].constraints = { requireApprovalFor: ["github_delete_*"] };

    vi.mocked(discoverPackages).mockReturnValue(makePackages(agentName));
    vi.mocked(resolveAgent).mockReturnValue(agent);
    vi.mocked(computeToolFilters).mockReturnValue(new Map());

    await startProxy("/fake/root", { agent: agentName });

    expect(ForgeProxyServer).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalPatterns: ["github_delete_*"],
      }),
    );
  });
});
