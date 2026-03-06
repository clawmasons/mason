import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { program } from "../../src/cli/index.js";

// ── Mock all heavy dependencies ──────────────────────────────────────

vi.mock("../../src/resolver/discover.js", () => ({
  discoverPackages: vi.fn(),
}));

vi.mock("../../src/resolver/resolve.js", () => ({
  resolveMember: vi.fn(),
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
  ChapterProxyServer: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
}));

// ── Command Registration Tests ──────────────────────────────────────

describe("chapter proxy command", () => {
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

  it("has --member option", () => {
    const proxyCmd = program.commands.find((cmd) => cmd.name() === "proxy");
    const opt = proxyCmd?.options.find((o) => o.long === "--member");
    expect(opt).toBeDefined();
  });
});

// ── startProxy Unit Tests ──────────────────────────────────────────────

import { startProxy } from "../../src/cli/commands/proxy.js";
import { discoverPackages } from "../../src/resolver/discover.js";
import { resolveMember } from "../../src/resolver/resolve.js";
import { computeToolFilters } from "../../src/generator/toolfilter.js";
import { UpstreamManager } from "../../src/proxy/upstream.js";
import { ChapterProxyServer } from "../../src/proxy/server.js";
import type { DiscoveredPackage, ResolvedMember } from "../../src/resolver/types.js";

function makeMember(name: string): ResolvedMember {
  return {
    name,
    version: "1.0.0",
    memberType: "agent",
    memberName: name.split("/").pop()?.replace("member-", "") ?? name,
    slug: name.split("/").pop()?.replace("member-", "") ?? name,
    email: "test@chapter.local",
    authProviders: [],
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

function makePackages(memberName: string): Map<string, DiscoveredPackage> {
  const map = new Map<string, DiscoveredPackage>();
  map.set(memberName, {
    name: memberName,
    version: "1.0.0",
    packagePath: "/fake/path",
    chapterField: {
      type: "member",
      memberType: "agent",
      name: "Test Member",
      slug: "test",
      email: "test@chapter.local",
      authProviders: [],
      runtimes: ["claude-code"],
      roles: ["@test/role-dev"],
      resources: [],
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

  it("fails with no members found", async () => {
    vi.mocked(discoverPackages).mockReturnValue(new Map());

    await startProxy("/fake/root", {});

    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("fails with multiple members and no --member flag", async () => {
    const packages = new Map<string, DiscoveredPackage>();
    packages.set("@test/member-a", {
      name: "@test/member-a",
      version: "1.0.0",
      packagePath: "/fake/a",
      chapterField: { type: "member", memberType: "agent", name: "A", slug: "a", email: "a@chapter.local", authProviders: [], runtimes: ["claude-code"], roles: ["@test/role"], resources: [] },
    });
    packages.set("@test/member-b", {
      name: "@test/member-b",
      version: "1.0.0",
      packagePath: "/fake/b",
      chapterField: { type: "member", memberType: "agent", name: "B", slug: "b", email: "b@chapter.local", authProviders: [], runtimes: ["claude-code"], roles: ["@test/role"], resources: [] },
    });
    vi.mocked(discoverPackages).mockReturnValue(packages);

    await startProxy("/fake/root", {});

    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("auto-detects single member", async () => {
    const memberName = "@test/member-note-taker";
    vi.mocked(discoverPackages).mockReturnValue(makePackages(memberName));
    vi.mocked(resolveMember).mockReturnValue(makeMember(memberName));
    vi.mocked(computeToolFilters).mockReturnValue(new Map());

    await startProxy("/fake/root", {});

    expect(resolveMember).toHaveBeenCalledWith(memberName, expect.any(Map));
    expect(ChapterProxyServer).toHaveBeenCalled();
  });

  it("uses --member flag to select member", async () => {
    const memberName = "@test/member-specific";
    vi.mocked(discoverPackages).mockReturnValue(makePackages(memberName));
    vi.mocked(resolveMember).mockReturnValue(makeMember(memberName));
    vi.mocked(computeToolFilters).mockReturnValue(new Map());

    await startProxy("/fake/root", { member: memberName });

    expect(resolveMember).toHaveBeenCalledWith(memberName, expect.any(Map));
  });

  it("passes --port to server config", async () => {
    const memberName = "@test/member-port";
    vi.mocked(discoverPackages).mockReturnValue(makePackages(memberName));
    vi.mocked(resolveMember).mockReturnValue(makeMember(memberName));
    vi.mocked(computeToolFilters).mockReturnValue(new Map());

    await startProxy("/fake/root", { member: memberName, port: "8080" });

    expect(ChapterProxyServer).toHaveBeenCalledWith(
      expect.objectContaining({ port: 8080 }),
    );
  });

  it("passes --startup-timeout to upstream initialize", async () => {
    const memberName = "@test/member-timeout";
    vi.mocked(discoverPackages).mockReturnValue(makePackages(memberName));
    vi.mocked(resolveMember).mockReturnValue(makeMember(memberName));
    vi.mocked(computeToolFilters).mockReturnValue(new Map());

    await startProxy("/fake/root", { member: memberName, startupTimeout: "30" });

    const mockUpstreamInstance = vi.mocked(UpstreamManager).mock.results[0]?.value;
    expect(mockUpstreamInstance.initialize).toHaveBeenCalledWith(30000);
  });

  it("creates upstream configs with resolved env vars", async () => {
    const memberName = "@test/member-env";
    vi.mocked(discoverPackages).mockReturnValue(makePackages(memberName));
    vi.mocked(resolveMember).mockReturnValue(makeMember(memberName));
    vi.mocked(computeToolFilters).mockReturnValue(new Map());

    await startProxy("/fake/root", { member: memberName });

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
    const memberName = "@test/member-approval";
    const member = makeMember(memberName);
    member.roles[0].constraints = { requireApprovalFor: ["github_delete_*"] };

    vi.mocked(discoverPackages).mockReturnValue(makePackages(memberName));
    vi.mocked(resolveMember).mockReturnValue(member);
    vi.mocked(computeToolFilters).mockReturnValue(new Map());

    await startProxy("/fake/root", { member: memberName });

    expect(ChapterProxyServer).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalPatterns: ["github_delete_*"],
      }),
    );
  });
});
