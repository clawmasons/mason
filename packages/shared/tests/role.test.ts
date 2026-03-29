import { describe, it, expect } from "vitest";
import {
  toolPermissionsSchema,
  roleMetadataSchema,
  taskRefSchema,
  skillRefSchema,
  mcpServerConfigSchema,
  mountConfigSchema,
  containerRequirementsSchema,
  governanceConfigSchema,
  resourceFileSchema,
  roleSourceSchema,
  roleSchema,
} from "@clawmasons/shared";

// ---------------------------------------------------------------------------
// ToolPermissions
// ---------------------------------------------------------------------------
describe("toolPermissionsSchema", () => {
  it("accepts valid allow/deny arrays", () => {
    const result = toolPermissionsSchema.parse({
      allow: ["create_issue"],
      deny: ["delete_repo"],
    });
    expect(result.allow).toEqual(["create_issue"]);
    expect(result.deny).toEqual(["delete_repo"]);
  });

  it("defaults to empty arrays", () => {
    const result = toolPermissionsSchema.parse({});
    expect(result.allow).toEqual([]);
    expect(result.deny).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// RoleMetadata
// ---------------------------------------------------------------------------
describe("roleMetadataSchema", () => {
  it("accepts all fields", () => {
    const result = roleMetadataSchema.parse({
      name: "create-prd",
      description: "Creates PRDs",
      version: "1.0.0",
      scope: "acme.engineering",
    });
    expect(result.name).toBe("create-prd");
    expect(result.version).toBe("1.0.0");
  });

  it("accepts required fields only", () => {
    const result = roleMetadataSchema.parse({
      name: "create-prd",
      description: "Creates PRDs",
    });
    expect(result.version).toBeUndefined();
    expect(result.scope).toBeUndefined();
  });

  it("rejects missing name", () => {
    expect(() =>
      roleMetadataSchema.parse({ description: "Creates PRDs" })
    ).toThrow();
  });

  it("rejects missing description", () => {
    expect(() =>
      roleMetadataSchema.parse({ name: "create-prd" })
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// TaskRef
// ---------------------------------------------------------------------------
describe("taskRefSchema", () => {
  it("accepts name and ref", () => {
    const result = taskRefSchema.parse({
      name: "define-change",
      ref: "@acme/task-define-change",
    });
    expect(result.name).toBe("define-change");
    expect(result.ref).toBe("@acme/task-define-change");
  });

  it("accepts name only", () => {
    const result = taskRefSchema.parse({ name: "define-change" });
    expect(result.ref).toBeUndefined();
  });

  it("rejects missing name", () => {
    expect(() => taskRefSchema.parse({})).toThrow();
  });
});

// ---------------------------------------------------------------------------
// SkillRef
// ---------------------------------------------------------------------------
describe("skillRefSchema", () => {
  it("accepts name and ref", () => {
    const result = skillRefSchema.parse({
      name: "prd-writing",
      ref: "@acme/skill-prd-writing",
    });
    expect(result.name).toBe("prd-writing");
    expect(result.ref).toBe("@acme/skill-prd-writing");
  });

  it("accepts name only", () => {
    const result = skillRefSchema.parse({ name: "prd-writing" });
    expect(result.ref).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// McpServerConfig
// ---------------------------------------------------------------------------
describe("mcpServerConfigSchema", () => {
  it("accepts a full stdio app config", () => {
    const result = mcpServerConfigSchema.parse({
      name: "github",
      transport: "stdio",
      command: "npx",
      args: ["-y", "server-github"],
      tools: { allow: ["create_issue"] },
    });
    expect(result.name).toBe("github");
    expect(result.transport).toBe("stdio");
    expect(result.tools.allow).toEqual(["create_issue"]);
  });

  it("accepts a remote streamable-http app config", () => {
    const result = mcpServerConfigSchema.parse({
      name: "remote-api",
      transport: "streamable-http",
      url: "https://api.example.com",
    });
    expect(result.transport).toBe("streamable-http");
    expect(result.url).toBe("https://api.example.com");
  });

  it("applies defaults for env, tools, credentials", () => {
    const result = mcpServerConfigSchema.parse({ name: "minimal" });
    expect(result.env).toEqual({});
    expect(result.tools).toEqual({ allow: [], deny: [] });
    expect(result.credentials).toEqual([]);
  });

  it("rejects invalid transport type", () => {
    expect(() =>
      mcpServerConfigSchema.parse({ name: "bad", transport: "websocket" })
    ).toThrow();
  });

  it("rejects missing name", () => {
    expect(() => mcpServerConfigSchema.parse({})).toThrow();
  });
});

// ---------------------------------------------------------------------------
// MountConfig
// ---------------------------------------------------------------------------
describe("mountConfigSchema", () => {
  it("accepts valid mount with readonly", () => {
    const result = mountConfigSchema.parse({
      source: "./data",
      target: "/workspace/data",
      readonly: true,
    });
    expect(result.readonly).toBe(true);
  });

  it("defaults readonly to false", () => {
    const result = mountConfigSchema.parse({
      source: "./data",
      target: "/workspace/data",
    });
    expect(result.readonly).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ContainerRequirements
// ---------------------------------------------------------------------------
describe("containerRequirementsSchema", () => {
  it("accepts full container requirements", () => {
    const result = containerRequirementsSchema.parse({
      packages: { apt: ["jq"], npm: ["typescript"], pip: ["pdfkit"] },
      ignore: { paths: [".env"] },
      mounts: [{ source: "./data", target: "/data" }],
      baseImage: "node:22",
    });
    expect(result.packages.apt).toEqual(["jq"]);
    expect(result.ignore.paths).toEqual([".env"]);
    expect(result.mounts).toHaveLength(1);
    expect(result.baseImage).toBe("node:22");
  });

  it("defaults all nested fields for empty object", () => {
    const result = containerRequirementsSchema.parse({});
    expect(result.packages).toEqual({ apt: [], npm: [], pip: [] });
    expect(result.ignore).toEqual({ paths: [] });
    expect(result.mounts).toEqual([]);
    expect(result.baseImage).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// GovernanceConfig
// ---------------------------------------------------------------------------
describe("governanceConfigSchema", () => {
  it("accepts full governance config", () => {
    const result = governanceConfigSchema.parse({
      risk: "HIGH",
      credentials: ["GITHUB_TOKEN"],
      constraints: {
        maxConcurrentTasks: 3,
        requireApprovalFor: ["create_pr"],
      },
    });
    expect(result.risk).toBe("HIGH");
    expect(result.credentials).toEqual(["GITHUB_TOKEN"]);
    expect(result.constraints?.maxConcurrentTasks).toBe(3);
  });

  it("defaults risk to LOW and credentials to empty", () => {
    const result = governanceConfigSchema.parse({});
    expect(result.risk).toBe("LOW");
    expect(result.credentials).toEqual([]);
  });

  it("rejects invalid risk level", () => {
    expect(() =>
      governanceConfigSchema.parse({ risk: "CRITICAL" })
    ).toThrow();
  });

  it("rejects non-positive maxConcurrentTasks", () => {
    expect(() =>
      governanceConfigSchema.parse({
        constraints: { maxConcurrentTasks: 0 },
      })
    ).toThrow();
  });

  it("rejects non-integer maxConcurrentTasks", () => {
    expect(() =>
      governanceConfigSchema.parse({
        constraints: { maxConcurrentTasks: 2.5 },
      })
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// ResourceFile
// ---------------------------------------------------------------------------
describe("resourceFileSchema", () => {
  it("accepts valid resource file with permissions", () => {
    const result = resourceFileSchema.parse({
      relativePath: "templates/prd.md",
      absolutePath: "/home/user/project/.claude/roles/x/templates/prd.md",
      permissions: 0o644,
    });
    expect(result.relativePath).toBe("templates/prd.md");
    expect(result.permissions).toBe(0o644);
  });

  it("accepts resource file without permissions", () => {
    const result = resourceFileSchema.parse({
      relativePath: "templates/prd.md",
      absolutePath: "/home/user/project/.claude/roles/x/templates/prd.md",
    });
    expect(result.permissions).toBeUndefined();
  });

  it("rejects missing relativePath", () => {
    expect(() =>
      resourceFileSchema.parse({ absolutePath: "/some/path" })
    ).toThrow();
  });

  it("rejects missing absolutePath", () => {
    expect(() =>
      resourceFileSchema.parse({ relativePath: "some/path" })
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// RoleSource
// ---------------------------------------------------------------------------
describe("roleSourceSchema", () => {
  it("accepts local source", () => {
    const result = roleSourceSchema.parse({
      type: "local",
      agentDialect: "claude-code-agent",
      path: "/home/user/project/.claude/roles/create-prd",
    });
    expect(result.type).toBe("local");
    expect(result.agentDialect).toBe("claude-code-agent");
  });

  it("accepts package source", () => {
    const result = roleSourceSchema.parse({
      type: "package",
      packageName: "@acme/role-create-prd",
    });
    expect(result.type).toBe("package");
    expect(result.packageName).toBe("@acme/role-create-prd");
  });

  it("rejects invalid type", () => {
    expect(() => roleSourceSchema.parse({ type: "remote" })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Role (top-level)
// ---------------------------------------------------------------------------
describe("roleSchema", () => {
  const minimalRole = {
    metadata: { name: "test", description: "Test role" },
    instructions: "You are a test agent.",
    source: { type: "local" as const },
  };

  it("accepts a minimal Role", () => {
    const result = roleSchema.parse(minimalRole);
    expect(result.metadata.name).toBe("test");
    expect(result.instructions).toBe("You are a test agent.");
    expect(result.tasks).toEqual([]);
    expect(result.mcp).toEqual([]);
    expect(result.skills).toEqual([]);
    expect(result.sources).toEqual([]);
    expect(result.resources).toEqual([]);
    expect(result.governance.risk).toBe("LOW");
    expect(result.governance.credentials).toEqual([]);
    expect(result.container.packages).toEqual({ apt: [], npm: [], pip: [] });
    expect(result.container.ignore).toEqual({ paths: [] });
    expect(result.container.mounts).toEqual([]);
  });

  it("accepts sources as a string array", () => {
    const result = roleSchema.parse({
      ...minimalRole,
      sources: [".claude/", ".codex/"],
    });
    expect(result.sources).toEqual([".claude/", ".codex/"]);
  });

  it("accepts empty sources array", () => {
    const result = roleSchema.parse({ ...minimalRole, sources: [] });
    expect(result.sources).toEqual([]);
  });

  it("defaults sources to empty array when omitted", () => {
    const result = roleSchema.parse(minimalRole);
    expect(result.sources).toEqual([]);
  });

  it("defaults type to project when omitted", () => {
    const result = roleSchema.parse(minimalRole);
    expect(result.type).toBe("project");
  });

  it("accepts type supervisor", () => {
    const result = roleSchema.parse({ ...minimalRole, type: "supervisor" });
    expect(result.type).toBe("supervisor");
  });

  it("accepts type project explicitly", () => {
    const result = roleSchema.parse({ ...minimalRole, type: "project" });
    expect(result.type).toBe("project");
  });

  it("rejects unknown type value", () => {
    expect(() =>
      roleSchema.parse({ ...minimalRole, type: "admin" })
    ).toThrow();
  });

  it("accepts a full Role", () => {
    const fullRole = {
      metadata: {
        name: "create-prd",
        description: "Creates PRDs",
        version: "1.0.0",
        scope: "acme.engineering",
      },
      instructions: "You are a PRD author.",
      tasks: [{ name: "define-change", ref: "@acme/task-define-change" }],
      mcp: [
        {
          name: "github",
          transport: "stdio" as const,
          command: "npx",
          args: ["-y", "server-github"],
          tools: { allow: ["create_issue"], deny: ["delete_repo"] },
        },
      ],
      skills: [{ name: "prd-writing", ref: "@acme/skill-prd-writing" }],
      container: {
        packages: { apt: ["jq"], npm: ["typescript"] },
        ignore: { paths: [".env", ".mason/"] },
        mounts: [{ source: "./data", target: "/workspace/data", readonly: true }],
        baseImage: "node:22",
      },
      governance: {
        risk: "HIGH" as const,
        credentials: ["GITHUB_TOKEN", "ANTHROPIC_API_KEY"],
        constraints: {
          maxConcurrentTasks: 3,
          requireApprovalFor: ["create_pr"],
        },
      },
      resources: [
        {
          relativePath: "templates/prd.md",
          absolutePath: "/home/user/.claude/roles/create-prd/templates/prd.md",
          permissions: 0o644,
        },
      ],
      source: {
        type: "local" as const,
        agentDialect: "claude-code-agent",
        path: "/home/user/.claude/roles/create-prd",
      },
    };

    const result = roleSchema.parse(fullRole);
    expect(result.metadata.name).toBe("create-prd");
    expect(result.tasks).toHaveLength(1);
    expect(result.mcp).toHaveLength(1);
    expect(result.skills).toHaveLength(1);
    expect(result.resources).toHaveLength(1);
    expect(result.governance.risk).toBe("HIGH");
    expect(result.container.baseImage).toBe("node:22");
  });

  it("rejects missing metadata", () => {
    expect(() =>
      roleSchema.parse({
        instructions: "You are a test agent.",
        source: { type: "local" },
      })
    ).toThrow();
  });

  it("rejects missing instructions", () => {
    expect(() =>
      roleSchema.parse({
        metadata: { name: "test", description: "Test role" },
        source: { type: "local" },
      })
    ).toThrow();
  });

  it("rejects missing source", () => {
    expect(() =>
      roleSchema.parse({
        metadata: { name: "test", description: "Test role" },
        instructions: "You are a test agent.",
      })
    ).toThrow();
  });
});
