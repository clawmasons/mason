import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { program } from "../../src/cli/index.js";

// ── Mock all heavy dependencies ──────────────────────────────────────

vi.mock("../../src/resolver/discover.js", () => ({
  discoverPackages: vi.fn(),
}));

vi.mock("../../src/resolver/resolve.js", () => ({
  resolveRolePackage: vi.fn(),
}));

vi.mock("@clawmasons/shared", async () => {
  const actual = await vi.importActual<typeof import("@clawmasons/shared")>("@clawmasons/shared");
  return {
    ...actual,
    computeToolFilters: vi.fn(() => new Map()),
    getAppShortName: vi.fn((name: string) => name.split("/").pop()?.replace("app-", "") ?? name),
  };
});

vi.mock("@clawmasons/proxy", () => ({
  loadEnvFile: vi.fn(() => ({})),
  resolveEnvVars: vi.fn((env: Record<string, string>) => env),
  openDatabase: vi.fn(() => ({
    close: vi.fn(),
  })),
  UpstreamManager: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    getTools: vi.fn(async () => []),
    getResources: vi.fn(async () => []),
    getPrompts: vi.fn(async () => []),
    shutdown: vi.fn(),
  })),
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
  ProxyServer: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    setRouting: vi.fn(),
  })),
}));

// ── Command Registration Tests ──────────────────────────────────────

describe("proxy command", () => {
  const proxyCmd = program.commands.find((cmd) => cmd.name() === "proxy");

  it("is registered", () => {
    expect(proxyCmd).toBeDefined();
  });

  it("has a description", () => {
    expect(proxyCmd?.description()).toContain("proxy");
  });

  it("has --port option", () => {
    const opt = proxyCmd?.options.find((o) => o.long === "--port");
    expect(opt).toBeDefined();
  });

  it("has --startup-timeout option", () => {
    const opt = proxyCmd?.options.find((o) => o.long === "--startup-timeout");
    expect(opt).toBeDefined();
  });

  it("has --agent option", () => {
    const opt = proxyCmd?.options.find((o) => o.long === "--agent");
    expect(opt).toBeDefined();
  });
});

// ── startProxy Unit Tests ──────────────────────────────────────────────

import { startProxy } from "../../src/cli/commands/proxy.js";
import { discoverPackages } from "../../src/resolver/discover.js";
import { resolveRolePackage } from "../../src/resolver/resolve.js";
import { computeToolFilters } from "@clawmasons/shared";
import { UpstreamManager, ProxyServer } from "@clawmasons/proxy";
import type { DiscoveredPackage, ResolvedRole } from "@clawmasons/shared";

function makeResolvedRole(name: string): ResolvedRole {
  return {
    name,
    version: "1.0.0",
    risk: "LOW" as const,
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
        credentials: [],
      },
    ],
    skills: [],
  };
}

function makeRolePackages(roleName: string): Map<string, DiscoveredPackage> {
  const map = new Map<string, DiscoveredPackage>();
  map.set(roleName, {
    name: roleName,
    version: "1.0.0",
    packagePath: "/fake/path",
    field: {
      type: "role",
      risk: "LOW",
      permissions: {
        "@test/app-github": { allow: ["create_pr"], deny: [] },
      },
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

  it("fails with no role packages found", async () => {
    vi.mocked(discoverPackages).mockReturnValue(new Map());

    await startProxy("/fake/root", {});

    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("fails with multiple role packages and no --role flag", async () => {
    const packages = new Map<string, DiscoveredPackage>();
    packages.set("@test/role-a", {
      name: "@test/role-a",
      version: "1.0.0",
      packagePath: "/fake/a",
      field: { type: "role", risk: "LOW", permissions: {} },
    });
    packages.set("@test/role-b", {
      name: "@test/role-b",
      version: "1.0.0",
      packagePath: "/fake/b",
      field: { type: "role", risk: "LOW", permissions: {} },
    });
    vi.mocked(discoverPackages).mockReturnValue(packages);

    await startProxy("/fake/root", {});

    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("auto-detects single role package", async () => {
    const roleName = "@test/role-dev";
    vi.mocked(discoverPackages).mockReturnValue(makeRolePackages(roleName));
    vi.mocked(resolveRolePackage).mockReturnValue(makeResolvedRole(roleName));
    vi.mocked(computeToolFilters).mockReturnValue(new Map());

    await startProxy("/fake/root", {});

    expect(resolveRolePackage).toHaveBeenCalledWith(roleName, expect.any(Map));
    expect(ProxyServer).toHaveBeenCalled();
  });

  it("uses --role flag to select role", async () => {
    const roleName = "@test/role-specific";
    vi.mocked(discoverPackages).mockReturnValue(makeRolePackages(roleName));
    vi.mocked(resolveRolePackage).mockReturnValue(makeResolvedRole(roleName));
    vi.mocked(computeToolFilters).mockReturnValue(new Map());

    await startProxy("/fake/root", { role: roleName });

    expect(resolveRolePackage).toHaveBeenCalledWith(roleName, expect.any(Map));
  });

  it("passes --port to server config", async () => {
    const roleName = "@test/role-port";
    vi.mocked(discoverPackages).mockReturnValue(makeRolePackages(roleName));
    vi.mocked(resolveRolePackage).mockReturnValue(makeResolvedRole(roleName));
    vi.mocked(computeToolFilters).mockReturnValue(new Map());

    await startProxy("/fake/root", { role: roleName, port: "8080" });

    expect(ProxyServer).toHaveBeenCalledWith(
      expect.objectContaining({ port: 8080 }),
    );
  });

  it("passes --startup-timeout to upstream initialize", async () => {
    const roleName = "@test/role-timeout";
    vi.mocked(discoverPackages).mockReturnValue(makeRolePackages(roleName));
    vi.mocked(resolveRolePackage).mockReturnValue(makeResolvedRole(roleName));
    vi.mocked(computeToolFilters).mockReturnValue(new Map());

    await startProxy("/fake/root", { role: roleName, startupTimeout: "30" });

    const mockUpstreamInstance = vi.mocked(UpstreamManager).mock.results[0]?.value;
    expect(mockUpstreamInstance.initialize).toHaveBeenCalledWith(30000);
  });

  it("creates upstream configs with resolved env vars", async () => {
    const roleName = "@test/role-env";
    vi.mocked(discoverPackages).mockReturnValue(makeRolePackages(roleName));
    vi.mocked(resolveRolePackage).mockReturnValue(makeResolvedRole(roleName));
    vi.mocked(computeToolFilters).mockReturnValue(new Map());

    await startProxy("/fake/root", { role: roleName });

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
    const roleName = "@test/role-approval";
    const resolved = makeResolvedRole(roleName);
    resolved.constraints = { requireApprovalFor: ["github_delete_*"] };

    vi.mocked(discoverPackages).mockReturnValue(makeRolePackages(roleName));
    vi.mocked(resolveRolePackage).mockReturnValue(resolved);
    vi.mocked(computeToolFilters).mockReturnValue(new Map());

    await startProxy("/fake/root", { role: roleName });

    expect(ProxyServer).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalPatterns: ["github_delete_*"],
      }),
    );
  });
});
