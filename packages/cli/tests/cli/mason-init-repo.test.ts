import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { RoleType } from "@clawmasons/shared";
import {
  generateMonorepo,
  generateRootPackageJson,
  generateRolePackageJson,
  generateSkillPackageJson,
  generateAppPackageJson,
  generateTaskPackageJson,
  scopeToNpmPrefix,
  deriveShortName,
  derivePackageName,
  initRepo,
} from "../../src/cli/commands/mason-init-repo.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir: string;

beforeEach(async () => {
  testDir = join(
    tmpdir(),
    `mason-init-repo-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

function makeMockRole(overrides?: Partial<RoleType>): RoleType {
  return {
    metadata: {
      name: "create-prd",
      description: "Creates PRD documents",
      version: "1.0.0",
      scope: "acme.engineering",
    },
    instructions: "You are a PRD author.",
    tasks: [
      { name: "define-change", ref: "define-change" },
      { name: "review-change", ref: "review-change" },
    ],
    apps: [{ name: "github", env: {}, tools: { allow: [], deny: [] }, credentials: [] }],
    skills: [{ name: "prd-writing", ref: "@acme/skill-prd-writing" }],
    container: {
      packages: { apt: [], npm: [], pip: [] },
      ignore: { paths: [] },
      mounts: [],
    },
    governance: { risk: "LOW", credentials: [], constraints: undefined },
    resources: [],
    source: {
      type: "local",
      agentDialect: "claude-code",
      path: join(testDir, ".claude", "roles", "create-prd"),
    },
    ...overrides,
  };
}

async function readJson(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw);
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Unit tests: utility functions
// ---------------------------------------------------------------------------

describe("scopeToNpmPrefix", () => {
  it("converts dot notation to npm scope", () => {
    expect(scopeToNpmPrefix("acme.engineering")).toBe("@acme-engineering/");
  });

  it("returns empty string for undefined scope", () => {
    expect(scopeToNpmPrefix(undefined)).toBe("");
  });

  it("handles simple scope without dots", () => {
    expect(scopeToNpmPrefix("acme")).toBe("@acme/");
  });
});

describe("deriveShortName", () => {
  it("extracts unscoped name from npm package", () => {
    expect(deriveShortName("@acme/skill-prd-writing")).toBe("skill-prd-writing");
  });

  it("uses basename for local path", () => {
    expect(deriveShortName("./skills/prd-writing")).toBe("prd-writing");
  });

  it("returns plain name as-is", () => {
    expect(deriveShortName("prd-writing")).toBe("prd-writing");
  });
});

describe("derivePackageName", () => {
  it("returns npm package reference as-is", () => {
    expect(derivePackageName("@acme/skill-prd-writing", "skill", "@test/")).toBe(
      "@acme/skill-prd-writing",
    );
  });

  it("constructs name from local path with prefix", () => {
    expect(derivePackageName("./skills/prd-writing", "skill", "@test/")).toBe(
      "@test/skill-prd-writing",
    );
  });
});

// ---------------------------------------------------------------------------
// Unit tests: package.json generators
// ---------------------------------------------------------------------------

describe("generateRootPackageJson", () => {
  it("generates valid root package.json", () => {
    const pkg = generateRootPackageJson("create-prd", [
      "roles/*",
      "skills/*",
      "tasks/*",
    ]);
    expect(pkg.name).toBe("create-prd-monorepo");
    expect(pkg.private).toBe(true);
    expect(pkg.workspaces).toEqual(["roles/*", "skills/*", "tasks/*"]);
  });
});

describe("generateRolePackageJson", () => {
  it("generates role package.json with correct chapter.type", () => {
    const role = makeMockRole();
    const pkg = generateRolePackageJson(role, "@acme-engineering/", {
      "@acme-engineering/skill-prd-writing": "1.0.0",
    });
    expect(pkg.name).toBe("@acme-engineering/role-create-prd");
    expect(pkg.version).toBe("1.0.0");
    expect((pkg.chapter as Record<string, string>).type).toBe("role");
    expect(pkg.dependencies).toEqual({
      "@acme-engineering/skill-prd-writing": "1.0.0",
    });
  });

  it("defaults version to 1.0.0 when not specified", () => {
    const role = makeMockRole({
      metadata: {
        name: "test",
        description: "test",
        version: undefined,
      },
    });
    const pkg = generateRolePackageJson(role, "", {});
    expect(pkg.version).toBe("1.0.0");
  });
});

describe("generateSkillPackageJson", () => {
  it("generates skill package.json with correct chapter.type", () => {
    const pkg = generateSkillPackageJson(
      { name: "prd-writing", ref: "@acme/skill-prd-writing" },
      "@acme-engineering/",
    );
    expect((pkg.chapter as Record<string, string>).type).toBe("skill");
    expect(pkg.name).toBe("@acme-engineering/skill-skill-prd-writing");
  });
});

describe("generateAppPackageJson", () => {
  it("generates app package.json with correct chapter.type", () => {
    const pkg = generateAppPackageJson(
      { name: "github", env: {}, tools: { allow: [], deny: [] }, credentials: [] },
      "@acme-engineering/",
    );
    expect((pkg.chapter as Record<string, string>).type).toBe("app");
    expect(pkg.name).toBe("@acme-engineering/app-github");
  });
});

describe("generateTaskPackageJson", () => {
  it("generates task package.json with correct chapter.type", () => {
    const pkg = generateTaskPackageJson(
      { name: "define-change", ref: "define-change" },
      "@acme-engineering/",
    );
    expect((pkg.chapter as Record<string, string>).type).toBe("task");
    expect(pkg.name).toBe("@acme-engineering/task-define-change");
  });
});

// ---------------------------------------------------------------------------
// Integration tests: generateMonorepo
// ---------------------------------------------------------------------------

describe("generateMonorepo", () => {
  it("generates the correct directory structure (PRD §11.3)", async () => {
    const role = makeMockRole();
    const targetDir = join(testDir, "output");

    await generateMonorepo(role, targetDir);

    // Root package.json
    expect(await exists(join(targetDir, "package.json"))).toBe(true);

    // Role package
    expect(await exists(join(targetDir, "roles", "create-prd", "package.json"))).toBe(true);
    expect(await exists(join(targetDir, "roles", "create-prd", "ROLE.md"))).toBe(true);

    // Skill package
    expect(await exists(join(targetDir, "skills", "skill-prd-writing", "package.json"))).toBe(true);
    expect(await exists(join(targetDir, "skills", "skill-prd-writing", "SKILL.md"))).toBe(true);

    // App package
    expect(await exists(join(targetDir, "apps", "github", "package.json"))).toBe(true);

    // Task packages
    expect(await exists(join(targetDir, "tasks", "define-change", "package.json"))).toBe(true);
    expect(await exists(join(targetDir, "tasks", "define-change", "PROMPT.md"))).toBe(true);
    expect(await exists(join(targetDir, "tasks", "review-change", "package.json"))).toBe(true);
    expect(await exists(join(targetDir, "tasks", "review-change", "PROMPT.md"))).toBe(true);
  });

  it("generates valid root package.json with workspace config", async () => {
    const role = makeMockRole();
    const targetDir = join(testDir, "output");

    await generateMonorepo(role, targetDir);

    const rootPkg = (await readJson(join(targetDir, "package.json"))) as Record<
      string,
      unknown
    >;
    expect(rootPkg.name).toBe("create-prd-monorepo");
    expect(rootPkg.private).toBe(true);
    expect(rootPkg.workspaces).toEqual([
      "roles/*",
      "skills/*",
      "apps/*",
      "tasks/*",
    ]);
  });

  it("generates role package.json with chapter.type = 'role'", async () => {
    const role = makeMockRole();
    const targetDir = join(testDir, "output");

    await generateMonorepo(role, targetDir);

    const rolePkg = (await readJson(
      join(targetDir, "roles", "create-prd", "package.json"),
    )) as Record<string, unknown>;
    expect((rolePkg.chapter as Record<string, string>).type).toBe("role");
    expect(rolePkg.description).toBe("Creates PRD documents");
  });

  it("generates skill package.json with chapter.type = 'skill'", async () => {
    const role = makeMockRole();
    const targetDir = join(testDir, "output");

    await generateMonorepo(role, targetDir);

    const skillPkg = (await readJson(
      join(targetDir, "skills", "skill-prd-writing", "package.json"),
    )) as Record<string, unknown>;
    expect((skillPkg.chapter as Record<string, string>).type).toBe("skill");
  });

  it("generates app package.json with chapter.type = 'app'", async () => {
    const role = makeMockRole();
    const targetDir = join(testDir, "output");

    await generateMonorepo(role, targetDir);

    const appPkg = (await readJson(
      join(targetDir, "apps", "github", "package.json"),
    )) as Record<string, unknown>;
    expect((appPkg.chapter as Record<string, string>).type).toBe("app");
  });

  it("generates task package.json with chapter.type = 'task'", async () => {
    const role = makeMockRole();
    const targetDir = join(testDir, "output");

    await generateMonorepo(role, targetDir);

    const taskPkg = (await readJson(
      join(targetDir, "tasks", "define-change", "package.json"),
    )) as Record<string, unknown>;
    expect((taskPkg.chapter as Record<string, string>).type).toBe("task");
  });

  it("creates ROLE.md in the role package (fallback when source not accessible)", async () => {
    const role = makeMockRole();
    const targetDir = join(testDir, "output");

    await generateMonorepo(role, targetDir);

    const roleMd = await readFile(
      join(targetDir, "roles", "create-prd", "ROLE.md"),
      "utf-8",
    );
    expect(roleMd).toContain("create-prd");
    expect(roleMd).toContain("You are a PRD author.");
  });

  it("copies ROLE.md from source when available", async () => {
    const role = makeMockRole();
    const sourceDir = role.source.path!;
    await mkdir(sourceDir, { recursive: true });
    await writeFile(
      join(sourceDir, "ROLE.md"),
      "---\nname: create-prd\ndescription: test\n---\n\nOriginal content.\n",
    );

    const targetDir = join(testDir, "output");
    await generateMonorepo(role, targetDir);

    const roleMd = await readFile(
      join(targetDir, "roles", "create-prd", "ROLE.md"),
      "utf-8",
    );
    expect(roleMd).toContain("Original content.");
  });

  it("uses scope from role metadata for npm package names", async () => {
    const role = makeMockRole();
    const targetDir = join(testDir, "output");

    await generateMonorepo(role, targetDir);

    const rolePkg = (await readJson(
      join(targetDir, "roles", "create-prd", "package.json"),
    )) as Record<string, unknown>;
    expect(rolePkg.name).toBe("@acme-engineering/role-create-prd");
  });

  it("generates without scope when role has no scope", async () => {
    const role = makeMockRole({
      metadata: {
        name: "simple-role",
        description: "A simple role",
        version: "1.0.0",
        scope: undefined,
      },
    });
    const targetDir = join(testDir, "output");

    await generateMonorepo(role, targetDir);

    const rolePkg = (await readJson(
      join(targetDir, "roles", "simple-role", "package.json"),
    )) as Record<string, unknown>;
    expect(rolePkg.name).toBe("role-simple-role");
  });

  it("generates monorepo with no dependencies", async () => {
    const role = makeMockRole({
      tasks: [],
      apps: [],
      skills: [],
    });
    const targetDir = join(testDir, "output");

    await generateMonorepo(role, targetDir);

    const rootPkg = (await readJson(join(targetDir, "package.json"))) as Record<
      string,
      unknown
    >;
    // Only roles/* workspace when no dependencies
    expect(rootPkg.workspaces).toEqual(["roles/*"]);

    // No skills/apps/tasks directories
    expect(await exists(join(targetDir, "skills"))).toBe(false);
    expect(await exists(join(targetDir, "apps"))).toBe(false);
    expect(await exists(join(targetDir, "tasks"))).toBe(false);
  });

  it("includes dependencies in role package.json", async () => {
    const role = makeMockRole();
    const targetDir = join(testDir, "output");

    await generateMonorepo(role, targetDir);

    const rolePkg = (await readJson(
      join(targetDir, "roles", "create-prd", "package.json"),
    )) as Record<string, unknown>;
    const deps = rolePkg.dependencies as Record<string, string>;
    expect(deps).toBeDefined();
    expect(Object.keys(deps).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Integration tests: initRepo
// ---------------------------------------------------------------------------

describe("initRepo", () => {
  it("resolves role and generates monorepo at default target", async () => {
    const role = makeMockRole();
    const targetDir = join(testDir, ".mason", "repositories", "create-prd");

    await initRepo(testDir, { role: "create-prd" }, {
      resolveRoleFn: async () => role,
    });

    expect(await exists(join(targetDir, "package.json"))).toBe(true);
    expect(await exists(join(targetDir, "roles", "create-prd", "package.json"))).toBe(true);
  });

  it("uses custom target-dir when specified", async () => {
    const role = makeMockRole();
    const customDir = join(testDir, "custom-output");

    await initRepo(testDir, { role: "create-prd", targetDir: customDir }, {
      resolveRoleFn: async () => role,
    });

    expect(await exists(join(customDir, "package.json"))).toBe(true);
  });

  it("rejects packaged roles with clear error", async () => {
    const role = makeMockRole({
      source: {
        type: "package",
        packageName: "@acme/role-create-prd",
      },
    });

    // initRepo calls process.exit(1) on error, so we mock it
    const originalExit = process.exit;
    const originalError = console.error;
    let exitCode: number | undefined;
    let errorMessage = "";

    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;
    console.error = (msg: string) => {
      errorMessage += msg;
    };

    try {
      await initRepo(testDir, { role: "create-prd" }, {
        resolveRoleFn: async () => role,
      });
      expect(exitCode).toBe(1);
      expect(errorMessage).toContain("installed package");
    } finally {
      process.exit = originalExit;
      console.error = originalError;
    }
  });
});
