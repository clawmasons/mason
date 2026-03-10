import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { program } from "../../src/cli/index.js";
import {
  resolveAgentsForRole,
  generateInitRoleComposeYml,
  initRole,
} from "../../src/cli/commands/init-role.js";
import type { DiscoveredPackage, ResolvedAgent, ResolvedRole } from "@clawmasons/shared";

// ── Helpers ──────────────────────────────────────────────────────────────

function makeDiscoveredPackage(
  type: "agent" | "role" | "task" | "app" | "skill",
): DiscoveredPackage {
  return {
    name: `@test/${type}-test`,
    version: "1.0.0",
    dir: `/fake/${type}`,
    chapterField: {
      type,
      ...(type === "agent" ? { roles: ["@test/role-writer"] } : {}),
      ...(type === "role"
        ? { risk: "LOW" as const, tasks: [], apps: [], skills: [], permissions: {} }
        : {}),
    },
    dependencies: {},
  } as unknown as DiscoveredPackage;
}

function makeResolvedAgent(
  name: string,
  roles: Array<{ name: string; shortName: string }>,
): ResolvedAgent {
  return {
    name,
    version: "1.0.0",
    agentName: name,
    slug: name,
    runtimes: ["claude-code"],
    credentials: [],
    roles: roles.map(
      (r) =>
        ({
          name: r.name,
          version: "1.0.0",
          risk: "LOW" as const,
          permissions: {},
          tasks: [],
          apps: [],
          skills: [],
        }) as ResolvedRole,
    ),
  } as ResolvedAgent;
}

// ── Command Registration ─────────────────────────────────────────────────

describe("CLI init-role command", () => {
  it("has the init-role command registered under chapter", () => {
    const chapterCmd = program.commands.find((c) => c.name() === "chapter");
    expect(chapterCmd).toBeDefined();
    const cmd = chapterCmd!.commands.find((c) => c.name() === "init-role");
    expect(cmd).toBeDefined();
    if (cmd) {
      expect(cmd.description()).toContain("host-wide runtime");
    }
  });
});

// ── resolveAgentsForRole ─────────────────────────────────────────────────

describe("resolveAgentsForRole", () => {
  it("finds agents with matching role", () => {
    const packages = new Map<string, DiscoveredPackage>([
      ["@test/agent-note-taker", makeDiscoveredPackage("agent")],
      ["@test/role-writer", makeDiscoveredPackage("role")],
    ]);

    const resolveFn = () =>
      makeResolvedAgent("@test/agent-note-taker", [
        { name: "@test/role-writer", shortName: "writer" },
      ]);

    const result = resolveAgentsForRole(
      "@test/role-writer",
      undefined,
      packages,
      resolveFn,
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.shortName).toBe("note-taker");
  });

  it("throws when role not found in any agent", () => {
    const packages = new Map<string, DiscoveredPackage>([
      ["@test/agent-note-taker", makeDiscoveredPackage("agent")],
    ]);

    const resolveFn = () =>
      makeResolvedAgent("@test/agent-note-taker", [
        { name: "@test/role-reader", shortName: "reader" },
      ]);

    expect(() =>
      resolveAgentsForRole("@test/role-writer", undefined, packages, resolveFn),
    ).toThrow('Role "@test/role-writer" not found in any agent');
  });

  it("respects --agent filter", () => {
    const packages = new Map<string, DiscoveredPackage>([
      ["@test/agent-note-taker", makeDiscoveredPackage("agent")],
      ["@test/agent-reviewer", makeDiscoveredPackage("agent")],
    ]);

    const resolveFn = (name: string) =>
      makeResolvedAgent(name, [
        { name: "@test/role-writer", shortName: "writer" },
      ]);

    const result = resolveAgentsForRole(
      "@test/role-writer",
      "note-taker",
      packages,
      resolveFn,
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.shortName).toBe("note-taker");
  });

  it("throws when --agent specified but agent not found", () => {
    const packages = new Map<string, DiscoveredPackage>([
      ["@test/agent-note-taker", makeDiscoveredPackage("agent")],
    ]);

    const resolveFn = () =>
      makeResolvedAgent("@test/agent-note-taker", [
        { name: "@test/role-writer", shortName: "writer" },
      ]);

    expect(() =>
      resolveAgentsForRole(
        "@test/role-writer",
        "nonexistent",
        packages,
        resolveFn,
      ),
    ).toThrow('Agent "nonexistent" not found');
  });

  it("throws when --agent exists but doesn't have the role", () => {
    const packages = new Map<string, DiscoveredPackage>([
      ["@test/agent-note-taker", makeDiscoveredPackage("agent")],
    ]);

    const resolveFn = () =>
      makeResolvedAgent("@test/agent-note-taker", [
        { name: "@test/role-reader", shortName: "reader" },
      ]);

    expect(() =>
      resolveAgentsForRole(
        "@test/role-writer",
        "note-taker",
        packages,
        resolveFn,
      ),
    ).toThrow('does not have role "@test/role-writer"');
  });

  it("throws when no agent packages exist", () => {
    const packages = new Map<string, DiscoveredPackage>([
      ["@test/role-writer", makeDiscoveredPackage("role")],
    ]);

    const resolveFn = () =>
      makeResolvedAgent("@test/agent-note-taker", []);

    expect(() =>
      resolveAgentsForRole("@test/role-writer", undefined, packages, resolveFn),
    ).toThrow("No agent packages found");
  });

  it("finds multiple agents for same role", () => {
    const packages = new Map<string, DiscoveredPackage>([
      ["@test/agent-note-taker", makeDiscoveredPackage("agent")],
      ["@test/agent-reviewer", makeDiscoveredPackage("agent")],
    ]);

    const resolveFn = (name: string) =>
      makeResolvedAgent(name, [
        { name: "@test/role-writer", shortName: "writer" },
      ]);

    const result = resolveAgentsForRole(
      "@test/role-writer",
      undefined,
      packages,
      resolveFn,
    );

    expect(result).toHaveLength(2);
    const shortNames = result.map((r) => r.shortName).sort();
    expect(shortNames).toEqual(["note-taker", "reviewer"]);
  });
});

// ── generateInitRoleComposeYml ───────────────────────────────────────────

describe("generateInitRoleComposeYml", () => {
  it("generates correct YAML with env var substitution", () => {
    const yaml = generateInitRoleComposeYml({
      dockerBuildPath: "/path/to/docker",
      agents: [{ name: "@test/agent-note-taker", shortName: "note-taker" }],
      role: "@test/role-writer",
      roleShortName: "writer",
    });

    expect(yaml).toContain("# Generated by clawmasons init-role");
    expect(yaml).toContain("proxy-writer:");
    expect(yaml).toContain("credential-service:");
    expect(yaml).toContain("agent-note-taker-writer:");
    expect(yaml).toContain('context: "/path/to/docker"');
    expect(yaml).toContain('dockerfile: "proxy/writer/Dockerfile"');
    expect(yaml).toContain('dockerfile: "credential-service/Dockerfile"');
    expect(yaml).toContain(
      'dockerfile: "agent/note-taker/writer/Dockerfile"',
    );
    expect(yaml).toContain("${PROJECT_DIR}:/workspace");
    expect(yaml).toContain("CHAPTER_PROXY_TOKEN=${CHAPTER_PROXY_TOKEN}");
    expect(yaml).toContain(
      "CREDENTIAL_PROXY_TOKEN=${CREDENTIAL_PROXY_TOKEN}",
    );
    expect(yaml).toContain("MCP_PROXY_TOKEN=${CHAPTER_PROXY_TOKEN}");
    expect(yaml).toContain("init: true");
  });

  it("includes multiple agents for same role", () => {
    const yaml = generateInitRoleComposeYml({
      dockerBuildPath: "/path/to/docker",
      agents: [
        { name: "@test/agent-note-taker", shortName: "note-taker" },
        { name: "@test/agent-reviewer", shortName: "reviewer" },
      ],
      role: "@test/role-writer",
      roleShortName: "writer",
    });

    expect(yaml).toContain("agent-note-taker-writer:");
    expect(yaml).toContain("agent-reviewer-writer:");
    // Only one proxy and one credential-service
    const proxyMatches = yaml.match(/proxy-writer:/g);
    expect(proxyMatches).toHaveLength(1);
    // credential-service appears as a service name and in depends_on references
    expect(yaml).toContain("credential-service:\n");
  });
});

// ── initRole ─────────────────────────────────────────────────────────────

describe("initRole", () => {
  let tmpDir: string;
  let homeDir: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let exitSpy: any;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-init-role-test-"));
    homeDir = path.join(tmpDir, "clawmasons-home");
    fs.mkdirSync(homeDir, { recursive: true });

    // Create docker/ directory to simulate a built workspace
    fs.mkdirSync(path.join(tmpDir, "docker"), { recursive: true });

    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    exitSpy.mockRestore();
  });

  function makeDeps(overrides?: Partial<Parameters<typeof initRole>[2]>) {
    const packages = new Map<string, DiscoveredPackage>([
      ["@test/agent-note-taker", makeDiscoveredPackage("agent")],
      ["@test/role-writer", makeDiscoveredPackage("role")],
    ]);

    return {
      discoverPackagesFn: () => packages,
      resolveAgentFn: (name: string) =>
        makeResolvedAgent(name, [
          { name: "@test/role-writer", shortName: "writer" },
        ]),
      readChapterConfigFn: () => ({ chapter: "acme.platform" }),
      getClawmasonsHomeFn: () => homeDir,
      ...overrides,
    };
  }

  it("creates role directory and docker-compose.yaml", async () => {
    await initRole(tmpDir, { role: "@test/role-writer" }, makeDeps());

    const roleDir = path.join(homeDir, "acme", "platform", "writer");
    expect(fs.existsSync(roleDir)).toBe(true);
    expect(
      fs.existsSync(path.join(roleDir, "docker-compose.yaml")),
    ).toBe(true);

    const content = fs.readFileSync(
      path.join(roleDir, "docker-compose.yaml"),
      "utf-8",
    );
    expect(content).toContain("# Generated by clawmasons init-role");
    expect(content).toContain("proxy-writer:");
    expect(content).toContain("agent-note-taker-writer:");
  });

  it("updates chapters.json", async () => {
    await initRole(tmpDir, { role: "@test/role-writer" }, makeDeps());

    const chaptersPath = path.join(homeDir, "chapters.json");
    expect(fs.existsSync(chaptersPath)).toBe(true);

    const data = JSON.parse(fs.readFileSync(chaptersPath, "utf-8"));
    expect(data.chapters).toHaveLength(1);
    expect(data.chapters[0].lodge).toBe("acme");
    expect(data.chapters[0].chapter).toBe("platform");
    expect(data.chapters[0].role).toBe("writer");
    expect(data.chapters[0].agents).toEqual(["note-taker"]);
  });

  it("uses --target-dir for custom path", async () => {
    const customDir = path.join(tmpDir, "custom-role-dir");

    await initRole(
      tmpDir,
      { role: "@test/role-writer", targetDir: customDir },
      makeDeps(),
    );

    expect(fs.existsSync(path.join(customDir, "docker-compose.yaml"))).toBe(
      true,
    );

    // chapters.json should record the targetDir
    const chaptersPath = path.join(homeDir, "chapters.json");
    const data = JSON.parse(fs.readFileSync(chaptersPath, "utf-8"));
    expect(data.chapters[0].targetDir).toBe(customDir);
    expect(data.chapters[0].roleDir).toBe(customDir);
  });

  it("backs up existing docker-compose.yaml", async () => {
    // First init
    await initRole(tmpDir, { role: "@test/role-writer" }, makeDeps());

    const roleDir = path.join(homeDir, "acme", "platform", "writer");
    const composeFile = path.join(roleDir, "docker-compose.yaml");
    const originalContent = fs.readFileSync(composeFile, "utf-8");

    // Second init -- should create backup
    await initRole(tmpDir, { role: "@test/role-writer" }, makeDeps());

    const backupFile = path.join(roleDir, "docker-compose.yaml.bak");
    expect(fs.existsSync(backupFile)).toBe(true);
    expect(fs.readFileSync(backupFile, "utf-8")).toBe(originalContent);
  });

  it("creates logs directory", async () => {
    await initRole(tmpDir, { role: "@test/role-writer" }, makeDeps());

    const logsDir = path.join(
      homeDir,
      "acme",
      "platform",
      "writer",
      "logs",
    );
    expect(fs.existsSync(logsDir)).toBe(true);
  });

  it("ensures CLAWMASONS_HOME/.gitignore exists", async () => {
    await initRole(tmpDir, { role: "@test/role-writer" }, makeDeps());

    const gitignorePath = path.join(homeDir, ".gitignore");
    expect(fs.existsSync(gitignorePath)).toBe(true);
    const content = fs.readFileSync(gitignorePath, "utf-8");
    expect(content).toContain("**/logs/");
  });

  it("fails when docker build directory is missing", async () => {
    // Remove the docker directory
    fs.rmSync(path.join(tmpDir, "docker"), { recursive: true, force: true });

    await expect(
      initRole(tmpDir, { role: "@test/role-writer" }, makeDeps()),
    ).rejects.toThrow("process.exit called");
  });

  it("handles multiple agents for same role", async () => {
    const packages = new Map<string, DiscoveredPackage>([
      ["@test/agent-note-taker", makeDiscoveredPackage("agent")],
      ["@test/agent-reviewer", makeDiscoveredPackage("agent")],
      ["@test/role-writer", makeDiscoveredPackage("role")],
    ]);

    const deps = makeDeps({
      discoverPackagesFn: () => packages,
      resolveAgentFn: (name: string) =>
        makeResolvedAgent(name, [
          { name: "@test/role-writer", shortName: "writer" },
        ]),
    });

    await initRole(tmpDir, { role: "@test/role-writer" }, deps);

    const roleDir = path.join(homeDir, "acme", "platform", "writer");
    const content = fs.readFileSync(
      path.join(roleDir, "docker-compose.yaml"),
      "utf-8",
    );
    expect(content).toContain("agent-note-taker-writer:");
    expect(content).toContain("agent-reviewer-writer:");

    // chapters.json should list both agents
    const chaptersPath = path.join(homeDir, "chapters.json");
    const data = JSON.parse(fs.readFileSync(chaptersPath, "utf-8"));
    expect(data.chapters[0].agents.sort()).toEqual(["note-taker", "reviewer"]);
  });
});
