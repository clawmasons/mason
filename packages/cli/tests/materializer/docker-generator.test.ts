import { beforeAll, describe, expect, it } from "vitest";
import * as path from "node:path";
import type { Role } from "@clawmasons/shared";
import {
  generateVolumeMasks,
  sanitizeVolumeName,
  ensureSentinelFile,
  generateRoleDockerBuildDir,
  generateSessionComposeYml,
  createSessionDirectory,
} from "../../src/materializer/docker-generator.js";
import { registerAgents } from "../../src/materializer/role-materializer.js";
import claudeCodeAgent from "@clawmasons/claude-code-agent";

// Register claude-code-agent for tests (no longer a CLI built-in).
beforeAll(() => {
  registerAgents([claudeCodeAgent]);
});

// ---------------------------------------------------------------------------
// Test fixture
// ---------------------------------------------------------------------------

function makeTestRole(overrides?: Partial<Role>): Role {
  return {
    metadata: {
      name: "create-prd",
      description: "Creates product requirements documents",
      version: "1.0.0",
      scope: "acme",
    },
    instructions: "You are a PRD author.",
    tasks: [{ name: "define-change" }],
    apps: [
      {
        name: "github",
        transport: "stdio" as const,
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_TOKEN: "${GITHUB_TOKEN}" },
        tools: {
          allow: ["create_issue", "list_repos"],
          deny: ["delete_repo"],
        },
        credentials: ["GITHUB_TOKEN"],
        location: "proxy",
      },
    ],
    skills: [{ name: "prd-writing" }],
    container: {
      packages: { apt: ["jq", "curl"], npm: ["typescript"], pip: [] },
      ignore: { paths: [".mason/", ".claude/", ".env"] },
      mounts: [],
    },
    governance: {
      risk: "LOW",
      credentials: ["GITHUB_TOKEN"],
      constraints: { maxConcurrentTasks: 3 },
    },
    type: "project" as const,
    sources: [],
    resources: [],
    source: {
      type: "local",
      agentDialect: "claude-code-agent",
      path: "/projects/cool-app/.claude/roles/create-prd",
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// sanitizeVolumeName
// ---------------------------------------------------------------------------

describe("sanitizeVolumeName", () => {
  it("converts .mason to ignore-mason", () => {
    expect(sanitizeVolumeName(".mason")).toBe("ignore-mason");
  });

  it("converts .claude to ignore-claude", () => {
    expect(sanitizeVolumeName(".claude")).toBe("ignore-claude");
  });

  it("handles nested paths", () => {
    expect(sanitizeVolumeName("src/config")).toBe("ignore-src-config");
  });

  it("handles paths with dots", () => {
    expect(sanitizeVolumeName(".env.local")).toBe("ignore-envlocal");
  });

  it("strips leading/trailing hyphens", () => {
    const result = sanitizeVolumeName("/leading/");
    expect(result).not.toMatch(/^ignore--/);
    expect(result).not.toMatch(/-$/);
  });
});

// ---------------------------------------------------------------------------
// generateVolumeMasks
// ---------------------------------------------------------------------------

describe("generateVolumeMasks", () => {
  it("classifies paths ending with / as directories", () => {
    const masks = generateVolumeMasks([".mason/", ".claude/"]);

    expect(masks).toHaveLength(2);
    expect(masks[0]!.type).toBe("directory");
    expect(masks[1]!.type).toBe("directory");
  });

  it("classifies paths without trailing / as files", () => {
    const masks = generateVolumeMasks([".env", "config.json"]);

    expect(masks).toHaveLength(2);
    expect(masks[0]!.type).toBe("file");
    expect(masks[1]!.type).toBe("file");
  });

  it("generates named volume names for directories", () => {
    const masks = generateVolumeMasks([".mason/"]);

    expect(masks[0]!.volumeName).toBe("ignore-mason");
  });

  it("does not generate volume names for files", () => {
    const masks = generateVolumeMasks([".env"]);

    expect(masks[0]!.volumeName).toBeUndefined();
  });

  it("targets /home/mason/workspace/project/ for all masks", () => {
    const masks = generateVolumeMasks([".mason/", ".env"]);

    for (const mask of masks) {
      expect(mask.containerPath).toMatch(/^\/home\/mason\/workspace\/project\//);
    }
  });

  it("correctly builds container paths", () => {
    const masks = generateVolumeMasks([".mason/", ".env"]);

    expect(masks[0]!.containerPath).toBe("/home/mason/workspace/project/.mason");
    expect(masks[1]!.containerPath).toBe("/home/mason/workspace/project/.env");
  });

  it("handles mixed directories and files", () => {
    const masks = generateVolumeMasks([".mason/", ".claude/", ".env", ".codes/"]);

    const dirs = masks.filter((m) => m.type === "directory");
    const files = masks.filter((m) => m.type === "file");

    expect(dirs).toHaveLength(3);
    expect(files).toHaveLength(1);
  });

  it("returns empty array for empty input", () => {
    expect(generateVolumeMasks([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ensureSentinelFile
// ---------------------------------------------------------------------------

describe("ensureSentinelFile", () => {
  it("creates sentinel file when it does not exist", () => {
    const calls: Record<string, unknown[]> = {
      mkdirSync: [],
      writeFileSync: [],
      chmodSync: [],
    };

    ensureSentinelFile("/project", {
      existsSync: () => false,
      mkdirSync: (p, opts) => { calls.mkdirSync.push({ p, opts }); },
      writeFileSync: (p, data, opts) => { calls.writeFileSync.push({ p, data, opts }); },
      chmodSync: (p, mode) => { calls.chmodSync.push({ p, mode }); },
    });

    expect(calls.writeFileSync).toHaveLength(1);
    const writeCall = calls.writeFileSync[0] as { p: string; data: string; opts: { mode: number } };
    expect(writeCall.p).toBe(path.join("/project", ".mason", "empty-file"));
    expect(writeCall.data).toBe("");
    expect(writeCall.opts.mode).toBe(0o444);
  });

  it("does not create sentinel file when it already exists", () => {
    const calls: unknown[] = [];

    ensureSentinelFile("/project", {
      existsSync: () => true,
      mkdirSync: () => { calls.push("mkdir"); },
      writeFileSync: () => { calls.push("write"); },
      chmodSync: () => { calls.push("chmod"); },
    });

    expect(calls).toHaveLength(0);
  });

  it("returns the absolute path to the sentinel file", () => {
    const result = ensureSentinelFile("/project", {
      existsSync: () => true,
      mkdirSync: () => {},
      writeFileSync: () => {},
      chmodSync: () => {},
    });

    expect(result).toBe(path.join("/project", ".mason", "empty-file"));
  });

  it("creates parent directory with recursive option", () => {
    let mkdirOpts: { recursive?: boolean } | undefined;

    ensureSentinelFile("/project", {
      existsSync: () => false,
      mkdirSync: (_p, opts) => { mkdirOpts = opts as { recursive?: boolean }; },
      writeFileSync: () => {},
      chmodSync: () => {},
    });

    expect(mkdirOpts?.recursive).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// generateRoleDockerBuildDir
// ---------------------------------------------------------------------------

describe("generateRoleDockerBuildDir", () => {
  it("creates the expected directory structure", () => {
    const createdDirs: string[] = [];
    const writtenFiles = new Map<string, string>();

    const result = generateRoleDockerBuildDir(
      {
        role: makeTestRole(),
        agentType: "claude-code-agent",
        projectDir: "/project",
        agentName: "@acme/agent-note-taker",
        dockerBuildRoot: "/project/.mason/docker",
      },
      {
        mkdirSync: (p) => { createdDirs.push(p); },
        writeFileSync: (p, data) => { writtenFiles.set(p, data); },
      },
    );

    // Build dir path
    expect(result.buildDir).toBe(path.join("/project/.mason/docker", "create-prd"));

    // Agent Dockerfile exists
    const agentDockerfile = path.join(result.buildDir, "claude-code-agent", "Dockerfile");
    expect(writtenFiles.has(agentDockerfile)).toBe(true);
    expect(writtenFiles.get(agentDockerfile)).toContain("FROM");

    // Proxy Dockerfile exists
    const proxyDockerfile = path.join(result.buildDir, "mcp-proxy", "Dockerfile");
    expect(writtenFiles.has(proxyDockerfile)).toBe(true);
    expect(writtenFiles.get(proxyDockerfile)).toContain("FROM node:22-slim");

    // Reference compose exists
    const composeFile = path.join(result.buildDir, "docker-compose.yaml");
    expect(writtenFiles.has(composeFile)).toBe(true);

    // agent-launch.json lands in workspace/
    const agentLaunchFile = path.join(result.buildDir, "claude-code-agent", "workspace", "agent-launch.json");
    expect(writtenFiles.has(agentLaunchFile)).toBe(true);

    // Other workspace files land in build/workspace/project/
    const buildWorkspaceFiles = [...writtenFiles.keys()].filter((k) =>
      k.includes(path.join("claude-code-agent", "build", "workspace", "project")),
    );
    expect(buildWorkspaceFiles.length).toBeGreaterThan(0);

    // No other files should land directly in workspace/ (only agent-launch.json)
    const workspaceFiles = [...writtenFiles.keys()].filter((k) =>
      k.includes(path.join("claude-code-agent", "workspace")) &&
      !k.includes(path.join("claude-code-agent", "build", "workspace")),
    );
    expect(workspaceFiles).toEqual([agentLaunchFile]);
  });

  it("returns correct relative paths", () => {
    const result = generateRoleDockerBuildDir(
      {
        role: makeTestRole(),
        agentType: "claude-code-agent",
        projectDir: "/project",
        agentName: "@acme/agent",
      },
      {
        mkdirSync: () => {},
        writeFileSync: () => {},
      },
    );

    expect(result.agentDockerfilePath).toBe("claude-code-agent/Dockerfile");
    expect(result.proxyDockerfilePath).toBe("mcp-proxy/Dockerfile");
  });

  it("proxy Dockerfile uses node:22-slim and @clawmasons/proxy", () => {
    const writtenFiles = new Map<string, string>();

    generateRoleDockerBuildDir(
      {
        role: makeTestRole(),
        agentType: "claude-code-agent",
        projectDir: "/project",
        agentName: "@acme/agent",
      },
      {
        mkdirSync: () => {},
        writeFileSync: (p, data) => { writtenFiles.set(p, data); },
      },
    );

    const proxyDockerfile = [...writtenFiles.entries()].find(([k]) =>
      k.includes("mcp-proxy/Dockerfile"),
    );
    expect(proxyDockerfile).toBeDefined();
    expect(proxyDockerfile![1]).toContain("FROM node:22-slim");
    expect(proxyDockerfile![1]).toContain("mason");
    expect(proxyDockerfile![1]).toContain("proxy");
  });

  it("generates .claude.json in home/ (not build/workspace/project/) and SKILL.md in build/workspace/project/", () => {
    const writtenFiles = new Map<string, string>();

    generateRoleDockerBuildDir(
      {
        role: makeTestRole(),
        agentType: "claude-code-agent",
        projectDir: "/project",
        agentName: "@acme/agent",
      },
      {
        mkdirSync: () => {},
        writeFileSync: (p, data) => { writtenFiles.set(p, data); },
      },
    );

    const buildWorkspaceKeys = [...writtenFiles.keys()].filter((k) =>
      k.includes(path.join("claude-code-agent", "build", "workspace", "project")),
    );
    const homeKeys = [...writtenFiles.keys()].filter((k) =>
      k.includes(path.join("claude-code-agent", "home")) &&
      !k.includes(path.join("claude-code-agent", "workspace")),
    );

    // .claude.json goes to home/, not build/workspace/project/
    expect(buildWorkspaceKeys.some((k) => k.endsWith(".claude.json"))).toBe(false);
    expect(homeKeys.some((k) => k.endsWith(".claude.json"))).toBe(true);

    expect(buildWorkspaceKeys.some((k) => k.endsWith(".mcp.json"))).toBe(false);
    expect(buildWorkspaceKeys.some((k) => k.endsWith("AGENTS.md"))).toBe(false);
    // Skills without contentMap (no resolveSkillContent call) produce no files
  });

  it("supervisor role routes materialized files to home/ not build/workspace/project/", () => {
    const writtenFiles = new Map<string, string>();

    generateRoleDockerBuildDir(
      {
        role: makeTestRole({ type: "supervisor" }),
        agentType: "claude-code-agent",
        projectDir: "/project",
        agentName: "@acme/agent",
      },
      {
        mkdirSync: () => {},
        writeFileSync: (p, data) => { writtenFiles.set(p, data); },
      },
    );

    // No files in build/workspace/project/ for supervisor
    const projectDirFiles = [...writtenFiles.keys()].filter((k) =>
      k.includes(path.join("claude-code-agent", "build", "workspace", "project")),
    );
    expect(projectDirFiles).toHaveLength(0);

    // Materialized files go to home/
    const homeFiles = [...writtenFiles.keys()].filter((k) =>
      k.includes(path.join("claude-code-agent", "home")) &&
      !k.includes(path.join("claude-code-agent", "workspace")),
    );
    expect(homeFiles.length).toBeGreaterThan(0);

    // .claude.json (with mcpServers) in home/, not .mcp.json
    expect(homeFiles.some((k) => k.endsWith(".mcp.json"))).toBe(false);
    const claudeJsonFile = homeFiles.find((k) => k.endsWith(".claude.json"));
    expect(claudeJsonFile).toBeDefined();
    const claudeJsonContent = JSON.parse(writtenFiles.get(claudeJsonFile!)!);
    expect(claudeJsonContent.mcpServers).toBeDefined();

    // Skills without contentMap (no resolveSkillContent call) produce no files.
    // When contentMap is populated, skills go under home/.claude/skills/ not home/skills/.
  });

  it("supervisor role Dockerfile uses WORKDIR /home/mason/workspace (not /project)", () => {
    const writtenFiles = new Map<string, string>();

    generateRoleDockerBuildDir(
      {
        role: makeTestRole({ type: "supervisor" }),
        agentType: "claude-code-agent",
        projectDir: "/project",
        agentName: "@acme/agent",
      },
      {
        mkdirSync: () => {},
        writeFileSync: (p, data) => { writtenFiles.set(p, data); },
      },
    );

    const dockerfile = [...writtenFiles.entries()].find(([k]) =>
      k.endsWith(path.join("claude-code-agent", "Dockerfile")),
    );
    expect(dockerfile).toBeDefined();
    expect(dockerfile![1]).toContain("WORKDIR /home/mason/workspace\n");
    expect(dockerfile![1]).not.toContain("WORKDIR /home/mason/workspace/project");
  });

  it("agent-launch.json always goes to workspace/ regardless of role type", () => {
    const writtenFiles = new Map<string, string>();

    generateRoleDockerBuildDir(
      {
        role: makeTestRole({ type: "supervisor" }),
        agentType: "claude-code-agent",
        projectDir: "/project",
        agentName: "@acme/agent",
      },
      {
        mkdirSync: () => {},
        writeFileSync: (p, data) => { writtenFiles.set(p, data); },
      },
    );

    const agentLaunchFile = path.join("/project/.mason/docker", "create-prd", "claude-code-agent", "workspace", "agent-launch.json");
    expect(writtenFiles.has(agentLaunchFile)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// generateSessionComposeYml
// ---------------------------------------------------------------------------

describe("generateSessionComposeYml", () => {
  const baseOpts = {
    projectDir: "/project",
    dockerBuildDir: "/project/.mason/docker/create-prd",
    dockerDir: "/project/docker",
    roleName: "create-prd",
    agentType: "claude-code-agent",
    agentName: "@acme/agent",
    proxyToken: "test-proxy-token",
    relayToken: "test-cred-token",
    proxyPort: 3000,
    volumeMasks: generateVolumeMasks([".mason/", ".claude/", ".env"]),
    sessionDir: "/project/.mason/sessions/abc12345",
    logsDir: "/project/.mason/sessions/abc12345/logs",
    masonLogsDir: "/project/.mason/logs",
    workspacePath: "/project/.mason/docker/create-prd/claude-code-agent/workspace",
    buildWorkspaceProjectPath: "/project/.mason/docker/create-prd/claude-code-agent/build/workspace/project",
    buildWorkspaceProjectFileEntries: ["agent-launch.json"],
    buildWorkspaceProjectDirEntries: [".claude"],
  };

  it("generates valid YAML with proxy and agent services", () => {
    const yml = generateSessionComposeYml(baseOpts);

    expect(yml).toContain("services:");
    expect(yml).toContain("proxy-create-prd:");
    expect(yml).toContain("agent-create-prd:");
  });

  it("includes volume masking for directories as named volumes (skipping overlay conflicts)", () => {
    const yml = generateSessionComposeYml(baseOpts);

    // .mason is masked (no overlay for it)
    expect(yml).toContain("ignore-mason:/home/mason/workspace/project/.mason");
    // .claude is NOT masked — it has a build overlay directory that supersedes the mask
    expect(yml).not.toContain("ignore-claude:/home/mason/workspace/project/.claude");
  });

  it("includes volume masking for files as Docker Compose configs (VirtioFS-safe)", () => {
    const yml = generateSessionComposeYml(baseOpts);

    // File masks should appear as configs, not bind mounts
    expect(yml).toContain("mask-env:");
    expect(yml).toContain("target: /home/mason/workspace/project/.env");
    expect(yml).toContain("empty-file");
  });

  it("includes named volumes declaration section (excluding overlay conflicts)", () => {
    const yml = generateSessionComposeYml(baseOpts);

    expect(yml).toContain("volumes:");
    expect(yml).toContain("  ignore-mason:");
    // .claude is superseded by the build overlay — no named volume needed
    expect(yml).not.toContain("  ignore-claude:");
  });

  it("mounts project at /home/mason/workspace/project without :ro (agents need write access)", () => {
    const yml = generateSessionComposeYml(baseOpts);

    // Agent project mount should NOT have :ro
    const agentSection = yml.split("agent-create-prd:")[1]!;
    expect(agentSection).toContain(":/home/mason/workspace/project\n");
    expect(agentSection).not.toContain("/home/mason/workspace/project:ro");
  });

  it("mounts workspace path to /home/mason/workspace when workspacePath provided", () => {
    const yml = generateSessionComposeYml(baseOpts);

    expect(yml).toContain(":/home/mason/workspace\n");
  });

  it("emits file overlays as Docker Compose configs (VirtioFS-safe)", () => {
    const yml = generateSessionComposeYml(baseOpts);

    // Top-level configs section
    expect(yml).toContain("configs:");
    expect(yml).toContain("overlay-agent-launch-json:");
    expect(yml).not.toContain("overlay-claude-json:");

    // Service-level configs in agent service
    expect(yml).toContain("target: /home/mason/workspace/project/agent-launch.json");
    expect(yml).not.toContain("target: /home/mason/workspace/project/.claude.json");
  });

  it("emits directory overlays as bind mounts", () => {
    const yml = generateSessionComposeYml(baseOpts);

    // .claude is a directory entry — should appear as bind mount volume
    expect(yml).toContain(":/home/mason/workspace/project/.claude");

    // Should NOT appear as a config
    expect(yml).not.toContain("overlay-claude:");
  });

  it("does not emit overlay mounts when entries are empty", () => {
    const yml = generateSessionComposeYml({
      ...baseOpts,
      buildWorkspaceProjectFileEntries: [],
      buildWorkspaceProjectDirEntries: [],
    });

    expect(yml).not.toContain(":/home/mason/workspace/project/.claude.json");
    expect(yml).not.toContain("overlay-");
  });

  it("uses relative paths from session directory", () => {
    const yml = generateSessionComposeYml(baseOpts);

    // Should NOT contain absolute host paths in build contexts or volume sources
    expect(yml).not.toContain("/project/.mason/docker");
    // Host volume sources should use relative paths like ../../..
    // Container paths like /home/mason/workspace/project are fine (they're container-internal)
    const lines = yml.split("\n");
    for (const line of lines) {
      if (line.includes("context:") || (line.includes("- ") && line.includes(":"))) {
        // Build contexts and volume source paths should not be absolute host paths
        // (but container paths starting with / are ok)
        const trimmed = line.trim();
        if (trimmed.startsWith("- ") && trimmed.includes(":/")) {
          // Volume mount line: source:target — source should be relative or a named volume
          const source = trimmed.replace("- ", "").split(":")[0]!;
          if (source.startsWith("/") && !source.startsWith("/home/mason")) {
            throw new Error(`Absolute host path found in volume source: ${line}`);
          }
        }
      }
    }
  });

  it("mounts mason logs directory at /mason-logs on proxy service", () => {
    const yml = generateSessionComposeYml(baseOpts);
    const proxySection = yml.split("agent-create-prd:")[0]!;
    expect(proxySection).toContain(":/mason-logs");
  });

  it("includes PROJECT_DIR in proxy environment", () => {
    const yml = generateSessionComposeYml(baseOpts);
    const proxySection = yml.split("agent-create-prd:")[0]!;
    expect(proxySection).toContain("PROJECT_DIR=/home/mason/workspace/project");
  });

  it("includes tokens in environment", () => {
    const yml = generateSessionComposeYml(baseOpts);

    expect(yml).toContain("MASON_PROXY_TOKEN=test-proxy-token");
    expect(yml).toContain("RELAY_TOKEN=test-cred-token");
    expect(yml).toContain("MCP_PROXY_TOKEN=test-proxy-token");
  });

  it("includes proxy port mapping", () => {
    const yml = generateSessionComposeYml(baseOpts);

    expect(yml).toContain('"3000:9090"');
  });

  it("agent depends on proxy", () => {
    const yml = generateSessionComposeYml(baseOpts);

    expect(yml).toContain("depends_on:");
    expect(yml).toContain("- proxy-create-prd");
  });

  it("includes credential keys when provided", () => {
    const yml = generateSessionComposeYml({
      ...baseOpts,
      credentialKeys: ["GITHUB_TOKEN", "ANTHROPIC_API_KEY"],
    });

    expect(yml).toContain("MASON_DECLARED_CREDENTIALS=");
    expect(yml).toContain("AGENT_CREDENTIALS=");
  });

  it("includes ACP command when provided", () => {
    const yml = generateSessionComposeYml({
      ...baseOpts,
      acpCommand: ["--acp", "--port", "3002"],
    });

    expect(yml).toContain('command: ["--acp","--port","3002"]');
  });

  it("includes home directory mount when homePath is provided", () => {
    const yml = generateSessionComposeYml({
      ...baseOpts,
      homePath: "/project/.mason/docker/create-prd/claude-code-agent/home",
    });

    expect(yml).toContain(":/home/mason");
    // Should use relative path from session dir
    expect(yml).not.toContain("/project/.mason/docker/create-prd/claude-code-agent/home");
  });

  it("does not include home mount when homePath is omitted", () => {
    const yml = generateSessionComposeYml(baseOpts);
    const lines = yml.split("\n");
    // No volume line should mount directly to /home/mason (only /home/mason/workspace/project)
    const homeMountLines = lines.filter((l) => l.includes(":/home/mason") && !l.includes(":/home/mason/workspace"));
    expect(homeMountLines).toHaveLength(0);
  });

  it("includes HOST_UID and HOST_GID build args with provided values", () => {
    const yml = generateSessionComposeYml({
      ...baseOpts,
      hostUid: "501",
      hostGid: "20",
    });

    expect(yml).toContain('HOST_UID: "501"');
    expect(yml).toContain('HOST_GID: "20"');
  });

  it("defaults HOST_UID and HOST_GID to 1000 when not provided", () => {
    const yml = generateSessionComposeYml(baseOpts);

    expect(yml).toContain('HOST_UID: "1000"');
    expect(yml).toContain('HOST_GID: "1000"');
  });

  it("masking only applies to project mount paths (not /home/mason/workspace/)", () => {
    const yml = generateSessionComposeYml(baseOpts);

    // Volume masks should target /home/mason/workspace/project/ not /home/mason/workspace/
    const lines = yml.split("\n");
    const volumeLines = lines.filter((l) => l.includes("ignore-"));
    for (const line of volumeLines) {
      if (line.includes("/home/mason")) {
        expect(line).toContain("/home/mason/workspace/project/");
      }
    }
  });

  it("adds homeOverride volume before project mount", () => {
    const yml = generateSessionComposeYml({
      ...baseOpts,
      homeOverride: "/custom/home",
    });
    const agentSection = yml.split("agent-create-prd:")[1]!;
    const volumeSection = agentSection.split("volumes:")[1]!.split(/configs:|depends_on:/)[0]!;
    const mountLines = volumeSection.split("\n").filter((l) => l.trim().startsWith("- "));

    // First mount should be the home override
    expect(mountLines[0]).toContain(":/home/mason/");
    // Project mount comes next
    expect(mountLines[1]).toContain(":/home/mason/workspace/project");
  });

  it("adds bashMode AGENT_COMMAND_OVERRIDE env var", () => {
    const yml = generateSessionComposeYml({ ...baseOpts, bashMode: true });
    const agentSection = yml.split("agent-create-prd:")[1]!;
    expect(agentSection).toContain("AGENT_COMMAND_OVERRIDE=bash");
  });

  it("adds verbose AGENT_ENTRY_VERBOSE env var", () => {
    const yml = generateSessionComposeYml({ ...baseOpts, verbose: true });
    const agentSection = yml.split("agent-create-prd:")[1]!;
    expect(agentSection).toContain("AGENT_ENTRY_VERBOSE=1");
  });

  it("adds vscodeServerHostPath volume mount", () => {
    const yml = generateSessionComposeYml({
      ...baseOpts,
      vscodeServerHostPath: "/project/.mason/docker/vscode-server",
    });
    expect(yml).toContain(":/home/mason/.vscode-server");
  });
});

// ---------------------------------------------------------------------------
// createSessionDirectory
// ---------------------------------------------------------------------------

describe("createSessionDirectory", () => {
  it("creates session directory and compose file", () => {
    const createdDirs: string[] = [];
    const writtenFiles = new Map<string, string>();

    const result = createSessionDirectory(
      {
        projectDir: "/project",
        dockerBuildDir: "/project/.mason/docker/create-prd",
        dockerDir: "/project/docker",
        role: makeTestRole(),
        agentType: "claude-code-agent",
        agentName: "@acme/agent",
      },
      {
        mkdirSync: (p) => { createdDirs.push(p); },
        writeFileSync: (p, data) => { writtenFiles.set(p, data); },
        randomBytes: (n: number) => Buffer.from("a".repeat(n)),
      },
    );

    expect(result.sessionId).toBeDefined();
    expect(result.sessionDir).toContain(".mason/sessions/");
    expect(result.composeFile).toContain("docker-compose.yaml");
    expect(result.proxyServiceName).toBe("proxy-create-prd");
    expect(result.agentServiceName).toBe("agent-create-prd");

    // Verify directories were created
    expect(createdDirs.some((d) => d.includes("sessions"))).toBe(true);
    expect(createdDirs.some((d) => d.includes("logs"))).toBe(true);

    // Verify compose file was written
    expect(writtenFiles.has(result.composeFile)).toBe(true);
    const composeContent = writtenFiles.get(result.composeFile)!;
    expect(composeContent).toContain("services:");
    expect(composeContent).toContain("proxy-create-prd:");
    expect(composeContent).toContain("agent-create-prd:");
  });

  it("generates unique tokens", () => {
    let callCount = 0;
    const result = createSessionDirectory(
      {
        projectDir: "/project",
        dockerBuildDir: "/project/.mason/docker/create-prd",
        dockerDir: "/project/docker",
        role: makeTestRole(),
        agentType: "claude-code-agent",
        agentName: "@acme/agent",
      },
      {
        mkdirSync: () => {},
        writeFileSync: () => {},
        randomBytes: (n: number) => {
          callCount++;
          return Buffer.from(String(callCount).repeat(n));
        },
      },
    );

    expect(result.proxyToken).toBeDefined();
    expect(result.relayToken).toBeDefined();
    expect(result.proxyToken).not.toBe(result.relayToken);
  });

  it("includes volume masks in compose for role with ignore paths", () => {
    const writtenFiles = new Map<string, string>();

    createSessionDirectory(
      {
        projectDir: "/project",
        dockerBuildDir: "/project/.mason/docker/create-prd",
        dockerDir: "/project/docker",
        role: makeTestRole(),
        agentType: "claude-code-agent",
        agentName: "@acme/agent",
      },
      {
        mkdirSync: () => {},
        writeFileSync: (p, data) => { writtenFiles.set(p, data); },
        randomBytes: (n: number) => Buffer.from("b".repeat(n)),
      },
    );

    const composeFile = [...writtenFiles.entries()].find(([k]) =>
      k.endsWith("docker-compose.yaml"),
    );
    expect(composeFile).toBeDefined();

    const content = composeFile![1];
    // Directory masks
    expect(content).toContain("ignore-mason:/home/mason/workspace/project/.mason");
    expect(content).toContain("ignore-claude:/home/mason/workspace/project/.claude");
    // File mask (now via configs)
    expect(content).toContain("mask-env:");
    expect(content).toContain("target: /home/mason/workspace/project/.env");
  });

  it("works with role that has no ignore paths", () => {
    const writtenFiles = new Map<string, string>();
    const roleNoIgnore = makeTestRole({
      container: {
        packages: { apt: [], npm: [], pip: [] },
        ignore: { paths: [] },
        mounts: [],
      },
    });

    createSessionDirectory(
      {
        projectDir: "/project",
        dockerBuildDir: "/project/.mason/docker/minimal",
        dockerDir: "/project/docker",
        role: roleNoIgnore,
        agentType: "claude-code-agent",
        agentName: "@acme/agent",
      },
      {
        mkdirSync: () => {},
        writeFileSync: (p, data) => { writtenFiles.set(p, data); },
        randomBytes: (n: number) => Buffer.from("c".repeat(n)),
      },
    );

    const composeFile = [...writtenFiles.entries()].find(([k]) =>
      k.endsWith("docker-compose.yaml"),
    );
    expect(composeFile).toBeDefined();
    const content = composeFile![1];

    // Should NOT have volume masks or named volumes section
    expect(content).not.toContain("ignore-");
  });
});
