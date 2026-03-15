import { describe, expect, it } from "vitest";
import * as path from "node:path";
import type { RoleType } from "@clawmasons/shared";
import {
  generateVolumeMasks,
  sanitizeVolumeName,
  ensureSentinelFile,
  generateRoleDockerBuildDir,
  generateSessionComposeYml,
  createSessionDirectory,
} from "../../src/materializer/docker-generator.js";

// ---------------------------------------------------------------------------
// Test fixture
// ---------------------------------------------------------------------------

function makeTestRole(overrides?: Partial<RoleType>): RoleType {
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
    resources: [],
    source: {
      type: "local",
      agentDialect: "claude-code",
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
        agentType: "claude-code",
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
    const agentDockerfile = path.join(result.buildDir, "claude-code", "Dockerfile");
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
    const agentLaunchFile = path.join(result.buildDir, "claude-code", "workspace", "agent-launch.json");
    expect(writtenFiles.has(agentLaunchFile)).toBe(true);

    // Other workspace files land in build/workspace/project/
    const buildWorkspaceFiles = [...writtenFiles.keys()].filter((k) =>
      k.includes(path.join("claude-code", "build", "workspace", "project")),
    );
    expect(buildWorkspaceFiles.length).toBeGreaterThan(0);

    // No other files should land directly in workspace/ (only agent-launch.json)
    const workspaceFiles = [...writtenFiles.keys()].filter((k) =>
      k.includes(path.join("claude-code", "workspace")) &&
      !k.includes(path.join("claude-code", "build", "workspace")),
    );
    expect(workspaceFiles).toEqual([agentLaunchFile]);
  });

  it("returns correct relative paths", () => {
    const result = generateRoleDockerBuildDir(
      {
        role: makeTestRole(),
        agentType: "claude-code",
        projectDir: "/project",
        agentName: "@acme/agent",
      },
      {
        mkdirSync: () => {},
        writeFileSync: () => {},
      },
    );

    expect(result.agentDockerfilePath).toBe("claude-code/Dockerfile");
    expect(result.proxyDockerfilePath).toBe("mcp-proxy/Dockerfile");
  });

  it("proxy Dockerfile uses node:22-slim and @clawmasons/proxy", () => {
    const writtenFiles = new Map<string, string>();

    generateRoleDockerBuildDir(
      {
        role: makeTestRole(),
        agentType: "claude-code",
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

  it("generates workspace files including .mcp.json and AGENTS.md in build/workspace/project/", () => {
    const writtenFiles = new Map<string, string>();

    generateRoleDockerBuildDir(
      {
        role: makeTestRole(),
        agentType: "claude-code",
        projectDir: "/project",
        agentName: "@acme/agent",
      },
      {
        mkdirSync: () => {},
        writeFileSync: (p, data) => { writtenFiles.set(p, data); },
      },
    );

    const buildWorkspaceKeys = [...writtenFiles.keys()].filter((k) =>
      k.includes(path.join("claude-code", "build", "workspace", "project")),
    );

    const hasMcpJson = buildWorkspaceKeys.some((k) => k.endsWith(".mcp.json"));
    const hasAgentsMd = buildWorkspaceKeys.some((k) => k.endsWith("AGENTS.md"));

    expect(hasMcpJson).toBe(true);
    expect(hasAgentsMd).toBe(true);
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
    agentType: "claude-code",
    agentName: "@acme/agent",
    proxyToken: "test-proxy-token",
    credentialProxyToken: "test-cred-token",
    proxyPort: 3000,
    volumeMasks: generateVolumeMasks([".mason/", ".claude/", ".env"]),
    sessionDir: "/project/.mason/sessions/abc12345",
    logsDir: "/project/.mason/sessions/abc12345/logs",
    workspacePath: "/project/.mason/docker/create-prd/claude-code/workspace",
    buildWorkspaceProjectPath: "/project/.mason/docker/create-prd/claude-code/build/workspace/project",
    buildWorkspaceProjectEntries: [".mcp.json", ".claude", "AGENTS.md"],
  };

  it("generates valid YAML with proxy and agent services", () => {
    const yml = generateSessionComposeYml(baseOpts);

    expect(yml).toContain("services:");
    expect(yml).toContain("proxy-create-prd:");
    expect(yml).toContain("agent-create-prd:");
  });

  it("includes volume masking for directories as named volumes", () => {
    const yml = generateSessionComposeYml(baseOpts);

    expect(yml).toContain("ignore-mason:/home/mason/workspace/project/.mason");
    expect(yml).toContain("ignore-claude:/home/mason/workspace/project/.claude");
  });

  it("includes volume masking for files as sentinel bind mounts", () => {
    const yml = generateSessionComposeYml(baseOpts);

    expect(yml).toContain("/home/mason/workspace/project/.env:ro");
    expect(yml).toContain("empty-file");
  });

  it("includes named volumes declaration section", () => {
    const yml = generateSessionComposeYml(baseOpts);

    expect(yml).toContain("volumes:");
    expect(yml).toContain("  ignore-mason:");
    expect(yml).toContain("  ignore-claude:");
  });

  it("mounts project read-only at /home/mason/workspace/project", () => {
    const yml = generateSessionComposeYml(baseOpts);

    expect(yml).toContain("/home/mason/workspace/project:ro");
  });

  it("mounts workspace path to /home/mason/workspace when workspacePath provided", () => {
    const yml = generateSessionComposeYml(baseOpts);

    expect(yml).toContain(":/home/mason/workspace\n");
  });

  it("emits per-entry overlay mounts for build workspace project entries", () => {
    const yml = generateSessionComposeYml(baseOpts);

    expect(yml).toContain(":/home/mason/workspace/project/.mcp.json");
    expect(yml).toContain(":/home/mason/workspace/project/.claude");
    expect(yml).toContain(":/home/mason/workspace/project/AGENTS.md");
  });

  it("does not emit overlay mounts when buildWorkspaceProjectEntries is empty", () => {
    const yml = generateSessionComposeYml({
      ...baseOpts,
      buildWorkspaceProjectEntries: [],
    });

    // Should have workspace mount but no overlay mounts for specific files
    expect(yml).not.toContain(":/home/mason/workspace/project/.mcp.json");
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

  it("includes tokens in environment", () => {
    const yml = generateSessionComposeYml(baseOpts);

    expect(yml).toContain("CHAPTER_PROXY_TOKEN=test-proxy-token");
    expect(yml).toContain("CREDENTIAL_PROXY_TOKEN=test-cred-token");
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

    expect(yml).toContain("CHAPTER_DECLARED_CREDENTIALS=");
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
      homePath: "/project/.mason/docker/create-prd/claude-code/home",
    });

    expect(yml).toContain(":/home/mason");
    // Should use relative path from session dir
    expect(yml).not.toContain("/project/.mason/docker/create-prd/claude-code/home");
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
        agentType: "claude-code",
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
        agentType: "claude-code",
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
    expect(result.credentialProxyToken).toBeDefined();
    expect(result.proxyToken).not.toBe(result.credentialProxyToken);
  });

  it("includes volume masks in compose for role with ignore paths", () => {
    const writtenFiles = new Map<string, string>();

    createSessionDirectory(
      {
        projectDir: "/project",
        dockerBuildDir: "/project/.mason/docker/create-prd",
        dockerDir: "/project/docker",
        role: makeTestRole(),
        agentType: "claude-code",
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
    // File mask
    expect(content).toContain("/home/mason/workspace/project/.env:ro");
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
        agentType: "claude-code",
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
