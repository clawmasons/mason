import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { MockInstance } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { program } from "../../src/cli/index.js";

// ── Mock heavy dependencies ──────────────────────────────────────────

vi.mock("@clawmasons/shared", async () => {
  const actual = await vi.importActual<typeof import("@clawmasons/shared")>("@clawmasons/shared");
  return {
    ...actual,
    discoverRoles: vi.fn(),
    adaptRoleToResolvedAgent: vi.fn(),
    getAppShortName: vi.fn((name: string) => name.split("/").pop()?.replace(/^role-/, "") ?? name),
  };
});

vi.mock("../../src/materializer/docker-generator.js", () => ({
  generateRoleDockerBuildDir: vi.fn(() => ({ buildDir: "/fake/.mason/docker/my-role" })),
}));

vi.mock("../../src/materializer/proxy-dependencies.js", () => ({
  ensureProxyDependencies: vi.fn(),
  synthesizeRolePackages: vi.fn(),
}));

vi.mock("../../src/cli/commands/run-agent.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/cli/commands/run-agent.js")>("../../src/cli/commands/run-agent.js");
  return {
    ...actual,
    inferAgentType: vi.fn(() => "claude-code-agent"),
    resolveAgentType: vi.fn((t: string) => t),
  };
});

vi.mock("../../src/runtime/gitignore.js", () => ({
  ensureGitignoreEntry: vi.fn(),
}));

// ── Helpers ──────────────────────────────────────────────────────────

function makeRole(name: string) {
  return {
    metadata: { name },
    source: { agentDialect: "claude-code-agent" },
  };
}

// ── Command Registration ─────────────────────────────────────────────

describe("build command", () => {
  const buildCmd = program.commands.find((cmd) => cmd.name() === "build");

  it("is registered", () => {
    expect(buildCmd).toBeDefined();
    if (buildCmd) {
      expect(buildCmd.description()).toContain("Docker");
    }
  });

  it("accepts an optional [role] argument", () => {
    expect(buildCmd).toBeDefined();
    if (buildCmd) {
      const args = buildCmd.registeredArguments;
      expect(args).toHaveLength(1);
      expect(args[0].name()).toBe("role");
      expect(args[0].required).toBe(false);
    }
  });

  it("has --agent-type option", () => {
    expect(buildCmd).toBeDefined();
    if (buildCmd) {
      const opt = buildCmd.options.find((o) => o.long === "--agent-type");
      expect(opt).toBeDefined();
    }
  });
});

// ── runBuild unit tests ──────────────────────────────────────────────

describe("runBuild", () => {
  let tmpDir: string;
  let exitSpy: MockInstance;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  let discoverRoles: ReturnType<typeof vi.fn>;
  let generateRoleDockerBuildDir: ReturnType<typeof vi.fn>;
  let ensureProxyDependencies: ReturnType<typeof vi.fn>;
  let synthesizeRolePackages: ReturnType<typeof vi.fn>;
  let adaptRoleToResolvedAgent: ReturnType<typeof vi.fn>;
  let inferAgentType: ReturnType<typeof vi.fn>;
  let runBuild: (projectDir: string, roleName?: string, agentTypeOverride?: string) => Promise<void>;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mason-build-test-"));
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Get mocked module functions
    const shared = await import("@clawmasons/shared");
    const dockerGen = await import("../../src/materializer/docker-generator.js");
    const proxyDeps = await import("../../src/materializer/proxy-dependencies.js");
    const runAgentMod = await import("../../src/cli/commands/run-agent.js");

    discoverRoles = shared.discoverRoles as ReturnType<typeof vi.fn>;
    adaptRoleToResolvedAgent = shared.adaptRoleToResolvedAgent as ReturnType<typeof vi.fn>;
    generateRoleDockerBuildDir = dockerGen.generateRoleDockerBuildDir as ReturnType<typeof vi.fn>;
    ensureProxyDependencies = proxyDeps.ensureProxyDependencies as ReturnType<typeof vi.fn>;
    synthesizeRolePackages = proxyDeps.synthesizeRolePackages as ReturnType<typeof vi.fn>;
    inferAgentType = runAgentMod.inferAgentType as ReturnType<typeof vi.fn>;

    // Default happy-path returns
    discoverRoles.mockResolvedValue([]);
    adaptRoleToResolvedAgent.mockReturnValue({});
    generateRoleDockerBuildDir.mockReturnValue({ buildDir: path.join(tmpDir, ".mason/docker/my-role") });
    inferAgentType.mockReturnValue("claude-code-agent");

    const buildMod = await import("../../src/cli/commands/build.js");
    runBuild = buildMod.runBuild;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("exits with code 1 when no roles are discovered", async () => {
    discoverRoles.mockResolvedValue([]);

    await runBuild(tmpDir);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("No roles found");
  });

  it("exits with code 1 when named role is not found, and lists available roles", async () => {
    discoverRoles.mockResolvedValue([makeRole("my-role"), makeRole("other-role")]);

    await runBuild(tmpDir, "nonexistent");

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("nonexistent");
    expect(errorOutput).toContain("Available");
  });

  it("builds only the matching role when a name filter is given", async () => {
    discoverRoles.mockResolvedValue([makeRole("role-a"), makeRole("role-b")]);

    await runBuild(tmpDir, "role-b");

    expect(exitSpy).not.toHaveBeenCalledWith(1);
    // generateRoleDockerBuildDir should be called once (for the matched role only)
    expect(generateRoleDockerBuildDir).toHaveBeenCalledTimes(1);
  });

  it("exits with code 1 when adapter validation throws", async () => {
    discoverRoles.mockResolvedValue([makeRole("bad-role")]);
    adaptRoleToResolvedAgent.mockImplementation(() => {
      throw new Error("Missing required field: entrypoint");
    });

    await runBuild(tmpDir);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("Missing required field: entrypoint");
  });

  it("calls Docker generator, proxy deps, and package synthesis for all roles on success", async () => {
    discoverRoles.mockResolvedValue([makeRole("role-a"), makeRole("role-b")]);

    await runBuild(tmpDir);

    expect(exitSpy).not.toHaveBeenCalledWith(1);
    expect(generateRoleDockerBuildDir).toHaveBeenCalledTimes(2);
    expect(ensureProxyDependencies).toHaveBeenCalledTimes(1);
    expect(synthesizeRolePackages).toHaveBeenCalledTimes(2);
  });

  it("uses agentTypeOverride instead of inferred agent type when specified", async () => {
    discoverRoles.mockResolvedValue([makeRole("my-role")]);

    await runBuild(tmpDir, undefined, "mcp-agent");

    expect(exitSpy).not.toHaveBeenCalledWith(1);
    expect(generateRoleDockerBuildDir).toHaveBeenCalledWith(
      expect.objectContaining({ agentType: "mcp-agent" }),
    );
    // inferAgentType should NOT have been called since override was provided
    expect(inferAgentType).not.toHaveBeenCalled();
  });
});
