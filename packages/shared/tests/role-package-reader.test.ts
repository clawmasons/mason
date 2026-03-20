import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readPackagedRole,
  readMaterializedRole,
  PackageReadError,
  PackageDependencyError,
} from "@clawmasons/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir: string;

beforeEach(async () => {
  testDir = join(
    tmpdir(),
    `role-pkg-test-${Date.now()}-${Math.random().toString(36).substring(7)}`,
  );
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

/**
 * Create a mock NPM package directory with package.json and optional ROLE.md.
 */
async function createMockPackage(opts: {
  name: string;
  version?: string;
  masonType?: string;
  masonDialect?: string;
  roleMd?: string;
  extraFiles?: Record<string, string>;
}): Promise<string> {
  const pkgDir = join(testDir, "node_modules", opts.name);
  await mkdir(pkgDir, { recursive: true });

  const pkgJson: Record<string, unknown> = {
    name: opts.name,
    version: opts.version ?? "1.0.0",
  };
  if (opts.masonType !== undefined) {
    pkgJson.mason = {
      type: opts.masonType,
      ...(opts.masonDialect ? { dialect: opts.masonDialect } : {}),
    };
  }
  await writeFile(join(pkgDir, "package.json"), JSON.stringify(pkgJson, null, 2));

  if (opts.roleMd !== undefined) {
    await writeFile(join(pkgDir, "ROLE.md"), opts.roleMd);
  }

  if (opts.extraFiles) {
    for (const [relPath, content] of Object.entries(opts.extraFiles)) {
      const fullPath = join(pkgDir, relPath);
      await mkdir(join(fullPath, ".."), { recursive: true });
      await writeFile(fullPath, content);
    }
  }

  return pkgDir;
}

// A ROLE.md using generic ROLE_TYPES field names (for packaged roles)
const GENERIC_ROLE_MD = `---
name: create-prd
description: Creates product requirements documents
version: 1.0.0
scope: acme.engineering
tasks:
  - define-change
  - review-change
skills:
  - '@acme/skill-prd-writing'
apps:
  - name: github
    tools:
      allow:
        - create_issue
        - list_repos
      deny:
        - delete_repo
container:
  packages:
    apt:
      - jq
      - curl
    npm:
      - typescript
  ignore:
    paths:
      - '.mason/'
      - '.env'
risk: LOW
credentials:
  - GITHUB_TOKEN
constraints:
  maxConcurrentTasks: 3
  requireApprovalFor:
    - create_pr
---

You are a PRD author. Create clear, well-structured product requirements documents.

When defining requirements:
- Use concrete use cases with acceptance criteria
- Separate functional from non-functional requirements
`;

// A ROLE.md using Claude Code dialect field names (for dialect-aware packages)
const CLAUDE_DIALECT_ROLE_MD = `---
name: create-prd
description: Creates product requirements documents
version: 1.0.0
commands:
  - define-change
  - review-change
skills:
  - '@acme/skill-prd-writing'
mcp_servers:
  - name: github
    tools:
      allow:
        - create_issue
risk: LOW
---

You are a PRD author.
`;

// ---------------------------------------------------------------------------
// readPackagedRole — valid packages
// ---------------------------------------------------------------------------

describe("readPackagedRole — valid packages", () => {
  it("reads a role package with generic field names", async () => {
    const pkgDir = await createMockPackage({
      name: "@acme/role-create-prd",
      masonType: "role",
      roleMd: GENERIC_ROLE_MD,
    });

    const role = await readPackagedRole(pkgDir);

    // Metadata
    expect(role.metadata.name).toBe("create-prd");
    expect(role.metadata.description).toBe("Creates product requirements documents");
    expect(role.metadata.version).toBe("1.0.0");
    expect(role.metadata.scope).toBe("acme.engineering");

    // Instructions
    expect(role.instructions).toContain("You are a PRD author");

    // Tasks
    expect(role.tasks).toHaveLength(2);
    expect(role.tasks[0].name).toBe("define-change");
    expect(role.tasks[1].name).toBe("review-change");

    // Apps
    expect(role.apps).toHaveLength(1);
    expect(role.apps[0].name).toBe("github");
    expect(role.apps[0].tools.allow).toContain("create_issue");
    expect(role.apps[0].tools.deny).toContain("delete_repo");

    // Skills
    expect(role.skills).toHaveLength(1);
    expect(role.skills[0].ref).toBe("@acme/skill-prd-writing");

    // Container
    expect(role.container.packages.apt).toContain("jq");
    expect(role.container.packages.npm).toContain("typescript");
    expect(role.container.ignore.paths).toContain(".env");

    // Governance
    expect(role.governance.risk).toBe("LOW");
    expect(role.governance.credentials).toContain("GITHUB_TOKEN");
    expect(role.governance.constraints?.maxConcurrentTasks).toBe(3);

    // Source — the key difference from local roles
    expect(role.source.type).toBe("package");
    expect(role.source.packageName).toBe("@acme/role-create-prd");
    expect(role.source.agentDialect).toBeUndefined();
    expect(role.source.path).toBeUndefined();
  });

  it("reads a package with dialect-specific field names via mason.dialect", async () => {
    const pkgDir = await createMockPackage({
      name: "@acme/role-claude-prd",
      masonType: "role",
      masonDialect: "claude-code-agent",
      roleMd: CLAUDE_DIALECT_ROLE_MD,
    });

    const role = await readPackagedRole(pkgDir);

    // "commands" normalized to tasks via claude-code-agent dialect
    expect(role.tasks).toHaveLength(2);
    expect(role.tasks[0].name).toBe("define-change");

    // "mcp_servers" normalized to apps
    expect(role.apps).toHaveLength(1);
    expect(role.apps[0].name).toBe("github");

    expect(role.source.type).toBe("package");
    expect(role.source.packageName).toBe("@acme/role-claude-prd");
  });

  it("falls back to package.json name when frontmatter name is absent", async () => {
    const pkgDir = await createMockPackage({
      name: "@acme/role-unnamed",
      masonType: "role",
      roleMd: `---
description: A role without explicit name
---

Instructions.`,
    });

    const role = await readPackagedRole(pkgDir);
    expect(role.metadata.name).toBe("@acme/role-unnamed");
  });

  it("falls back to package.json version when frontmatter version is absent", async () => {
    const pkgDir = await createMockPackage({
      name: "@acme/role-versioned",
      version: "2.5.0",
      masonType: "role",
      roleMd: `---
name: versioned-role
description: A role without explicit version
---

Instructions.`,
    });

    const role = await readPackagedRole(pkgDir);
    expect(role.metadata.version).toBe("2.5.0");
  });

  it("discovers bundled resources in the package directory", async () => {
    const pkgDir = await createMockPackage({
      name: "@acme/role-with-resources",
      masonType: "role",
      roleMd: `---
name: with-resources
description: Role with bundled files
---

Instructions.`,
      extraFiles: {
        "templates/prd.md": "# PRD Template",
        "scripts/gen.py": "print('hello')",
      },
    });

    const role = await readPackagedRole(pkgDir);

    // package.json is excluded by scanBundledResources since it only skips ROLE.md
    // Resources include templates/ and scripts/ files, and package.json
    const relPaths = role.resources.map((r) => r.relativePath).sort();
    expect(relPaths).toContain("templates/prd.md");
    expect(relPaths).toContain("scripts/gen.py");
  });

  it("resolves local path skill references relative to package directory", async () => {
    const pkgDir = await createMockPackage({
      name: "@acme/role-local-skills",
      masonType: "role",
      roleMd: `---
name: local-skills
description: Role with local skill paths
skills:
  - ./skills/my-skill
---

Instructions.`,
    });

    const role = await readPackagedRole(pkgDir);
    expect(role.skills).toHaveLength(1);
    expect(role.skills[0].name).toBe("my-skill");
    // ref should be resolved relative to the package directory
    expect(role.skills[0].ref).toBe(join(pkgDir, "skills", "my-skill"));
  });

  it("accepts a minimal role package", async () => {
    const pkgDir = await createMockPackage({
      name: "minimal-role",
      masonType: "role",
      roleMd: `---
name: minimal
description: A minimal role
---

Do minimal things.`,
    });

    const role = await readPackagedRole(pkgDir);
    expect(role.metadata.name).toBe("minimal");
    expect(role.metadata.description).toBe("A minimal role");
    expect(role.instructions).toBe("Do minimal things.");
    expect(role.tasks).toEqual([]);
    expect(role.apps).toEqual([]);
    expect(role.skills).toEqual([]);
    expect(role.source.type).toBe("package");
    expect(role.source.packageName).toBe("minimal-role");
  });
});

// ---------------------------------------------------------------------------
// Equivalence with local parse (except source)
// ---------------------------------------------------------------------------

describe("readPackagedRole — equivalence with local parse", () => {
  it("produces identical ROLE_TYPES except for source field", async () => {
    // Create the same role as both a local ROLE.md and an NPM package
    const roleMd = `---
name: equiv-role
description: Testing equivalence
version: 1.0.0
tasks:
  - task-a
  - task-b
skills:
  - '@acme/skill-x'
apps:
  - name: server-a
    tools:
      allow:
        - tool_1
risk: MEDIUM
credentials:
  - MY_TOKEN
---

Instructions for the role.`;

    // Local role (Claude dialect uses "commands" for tasks, but for a fair comparison
    // we need the same frontmatter — so we use a Claude-dialect version)
    const claudeRoleMd = `---
name: equiv-role
description: Testing equivalence
version: 1.0.0
commands:
  - task-a
  - task-b
skills:
  - '@acme/skill-x'
mcp_servers:
  - name: server-a
    tools:
      allow:
        - tool_1
risk: MEDIUM
credentials:
  - MY_TOKEN
---

Instructions for the role.`;

    // Create local role
    const localRoleDir = join(testDir, ".claude", "roles", "equiv-role");
    await mkdir(localRoleDir, { recursive: true });
    await writeFile(join(localRoleDir, "ROLE.md"), claudeRoleMd);

    // Create packaged role (generic field names)
    const pkgDir = await createMockPackage({
      name: "@acme/role-equiv",
      masonType: "role",
      roleMd,
    });

    const localRole = await readMaterializedRole(join(localRoleDir, "ROLE.md"));
    const pkgRole = await readPackagedRole(pkgDir);

    // Core fields should match
    expect(pkgRole.metadata).toEqual(localRole.metadata);
    expect(pkgRole.instructions).toBe(localRole.instructions);
    expect(pkgRole.tasks).toEqual(localRole.tasks);
    expect(pkgRole.apps).toEqual(localRole.apps);
    expect(pkgRole.governance.risk).toBe(localRole.governance.risk);
    expect(pkgRole.governance.credentials).toEqual(localRole.governance.credentials);

    // Source should differ
    expect(localRole.source.type).toBe("local");
    expect(pkgRole.source.type).toBe("package");
    expect(pkgRole.source.packageName).toBe("@acme/role-equiv");
  });
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe("readPackagedRole — error handling", () => {
  it("throws PackageReadError when package.json is missing", async () => {
    const pkgDir = join(testDir, "no-pkg-json");
    await mkdir(pkgDir, { recursive: true });
    await writeFile(join(pkgDir, "ROLE.md"), "---\nname: x\ndescription: x\n---\nBody");

    await expect(readPackagedRole(pkgDir)).rejects.toThrow(PackageReadError);
    await expect(readPackagedRole(pkgDir)).rejects.toThrow("Missing package.json");
  });

  it("throws PackageReadError when mason.type is not role", async () => {
    const pkgDir = await createMockPackage({
      name: "not-a-role",
      masonType: "skill",
      roleMd: "---\nname: x\ndescription: x\n---\nBody",
    });

    await expect(readPackagedRole(pkgDir)).rejects.toThrow(PackageReadError);
    await expect(readPackagedRole(pkgDir)).rejects.toThrow(
      'does not have mason.type = "role"',
    );
  });

  it("throws PackageReadError when mason field is missing", async () => {
    const pkgDir = join(testDir, "no-mason");
    await mkdir(pkgDir, { recursive: true });
    await writeFile(
      join(pkgDir, "package.json"),
      JSON.stringify({ name: "no-mason" }),
    );
    await writeFile(join(pkgDir, "ROLE.md"), "---\nname: x\ndescription: x\n---\nBody");

    await expect(readPackagedRole(pkgDir)).rejects.toThrow(PackageReadError);
    await expect(readPackagedRole(pkgDir)).rejects.toThrow(
      'does not have mason.type = "role"',
    );
  });

  it("throws PackageReadError when ROLE.md is missing", async () => {
    const pkgDir = await createMockPackage({
      name: "missing-role-md",
      masonType: "role",
    });

    await expect(readPackagedRole(pkgDir)).rejects.toThrow(PackageReadError);
    await expect(readPackagedRole(pkgDir)).rejects.toThrow("missing ROLE.md");
  });

  it("throws PackageReadError when ROLE.md has no description", async () => {
    const pkgDir = await createMockPackage({
      name: "no-desc",
      masonType: "role",
      roleMd: `---
name: no-desc
---

Body.`,
    });

    await expect(readPackagedRole(pkgDir)).rejects.toThrow(PackageReadError);
    await expect(readPackagedRole(pkgDir)).rejects.toThrow("missing required field: description");
  });

  it("throws PackageReadError for invalid package.json", async () => {
    const pkgDir = join(testDir, "bad-json");
    await mkdir(pkgDir, { recursive: true });
    await writeFile(join(pkgDir, "package.json"), "not valid json{{{");

    await expect(readPackagedRole(pkgDir)).rejects.toThrow(PackageReadError);
    await expect(readPackagedRole(pkgDir)).rejects.toThrow("Invalid package.json");
  });

  it("throws PackageReadError for unknown dialect in mason.dialect", async () => {
    const pkgDir = await createMockPackage({
      name: "bad-dialect",
      masonType: "role",
      masonDialect: "nonexistent-dialect",
      roleMd: `---
name: bad
description: Bad dialect
---

Body.`,
    });

    await expect(readPackagedRole(pkgDir)).rejects.toThrow(PackageReadError);
    await expect(readPackagedRole(pkgDir)).rejects.toThrow('Unknown dialect "nonexistent-dialect"');
  });

  it("includes package path in error messages", async () => {
    const pkgDir = join(testDir, "error-path-test");
    await mkdir(pkgDir, { recursive: true });

    try {
      await readPackagedRole(pkgDir);
    } catch (err) {
      expect(err).toBeInstanceOf(PackageReadError);
      expect((err as PackageReadError).message).toContain(pkgDir);
      expect((err as PackageReadError).packagePath).toBe(pkgDir);
    }
  });

  it("throws RoleParseError for malformed YAML in ROLE.md", async () => {
    const pkgDir = await createMockPackage({
      name: "bad-yaml-pkg",
      masonType: "role",
      roleMd: `---
name: test
  bad: [indent
---

Body.`,
    });

    // parseFrontmatter throws RoleParseError, which propagates through
    await expect(readPackagedRole(pkgDir)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Dependency path resolution
// ---------------------------------------------------------------------------

describe("readPackagedRole — dependency path resolution", () => {
  it("resolves package skill references as-is", async () => {
    const pkgDir = await createMockPackage({
      name: "@acme/role-with-deps",
      masonType: "role",
      roleMd: `---
name: with-deps
description: Role with package skill references
skills:
  - '@acme/skill-prd-writing'
  - simple-skill
---

Instructions.`,
      extraFiles: { "skills/simple-skill/.keep": "" },
    });

    const role = await readPackagedRole(pkgDir);
    expect(role.skills).toHaveLength(2);
    expect(role.skills[0].name).toBe("skill-prd-writing");
    expect(role.skills[0].ref).toBe("@acme/skill-prd-writing");
    expect(role.skills[1].name).toBe("simple-skill");
    expect(role.skills[1].ref).toBe("simple-skill");
  });

  it("resolves relative path references from the package directory", async () => {
    const pkgDir = await createMockPackage({
      name: "@acme/role-relative-deps",
      masonType: "role",
      roleMd: `---
name: relative-deps
description: Role with relative path deps
skills:
  - ./lib/my-skill
  - ../sibling-pkg/skill
---

Instructions.`,
    });

    const role = await readPackagedRole(pkgDir);
    expect(role.skills).toHaveLength(2);
    expect(role.skills[0].ref).toBe(join(pkgDir, "lib", "my-skill"));
    expect(role.skills[1].ref).toBe(join(pkgDir, "..", "sibling-pkg", "skill"));
  });
});

// ---------------------------------------------------------------------------
// Bundled dependency validation
// ---------------------------------------------------------------------------

describe("readPackagedRole — bundled dependency validation", () => {
  it("loads successfully when all bundled skill subdirs exist", async () => {
    const pkgDir = await createMockPackage({
      name: "@acme/role-validated",
      masonType: "role",
      roleMd: `---
name: validated
description: Role with bundled skills
skills:
  - create-plan
  - run-tests
---
Instructions.`,
      extraFiles: {
        "skills/create-plan/.keep": "",
        "skills/run-tests/.keep": "",
      },
    });

    const role = await readPackagedRole(pkgDir);
    expect(role.skills).toHaveLength(2);
  });

  it("throws PackageDependencyError when a plain-name skill subdir is missing", async () => {
    const pkgDir = await createMockPackage({
      name: "@acme/role-missing-skill",
      masonType: "role",
      roleMd: `---
name: missing-skill
description: Role with a missing bundled skill
skills:
  - create-plan
---
Instructions.`,
    });

    await expect(readPackagedRole(pkgDir)).rejects.toThrow(
      PackageDependencyError,
    );
  });

  it("collects ALL missing skill paths before throwing", async () => {
    const pkgDir = await createMockPackage({
      name: "@acme/role-multi-missing",
      masonType: "role",
      roleMd: `---
name: multi-missing
description: Role with multiple missing bundled skills
skills:
  - skill-a
  - skill-b
  - skill-c
---
Instructions.`,
      extraFiles: { "skills/skill-b/.keep": "" },
    });

    let caught: PackageDependencyError | undefined;
    try {
      await readPackagedRole(pkgDir);
    } catch (e) {
      if (e instanceof PackageDependencyError) caught = e;
    }

    expect(caught).toBeDefined();
    expect(caught!.missingPaths).toHaveLength(2);
    expect(caught!.missingPaths.some((p) => p.endsWith("skills/skill-a"))).toBe(true);
    expect(caught!.missingPaths.some((p) => p.endsWith("skills/skill-c"))).toBe(true);
  });

  it("exposes roleMdPath in PackageDependencyError", async () => {
    const pkgDir = await createMockPackage({
      name: "@acme/role-check-path",
      masonType: "role",
      roleMd: `---
name: check-path
description: Role to check error path
skills:
  - missing-skill
---
Instructions.`,
    });

    let caught: PackageDependencyError | undefined;
    try {
      await readPackagedRole(pkgDir);
    } catch (e) {
      if (e instanceof PackageDependencyError) caught = e;
    }

    expect(caught).toBeDefined();
    expect(caught!.roleMdPath).toContain("ROLE.md");
  });

  it("does not validate scoped package skill refs", async () => {
    const pkgDir = await createMockPackage({
      name: "@acme/role-scoped-skills",
      masonType: "role",
      roleMd: `---
name: scoped-skills
description: Role with only scoped package skills
skills:
  - '@acme/skill-prd-writing'
  - '@org/other-skill'
---
Instructions.`,
    });

    // Should NOT throw — scoped refs are not validated as subdirs
    await expect(readPackagedRole(pkgDir)).resolves.toBeDefined();
  });

  it("does not validate path-relative skill refs", async () => {
    const pkgDir = await createMockPackage({
      name: "@acme/role-relative-skills",
      masonType: "role",
      roleMd: `---
name: relative-skills
description: Role with relative path skills
skills:
  - ./skills/my-local-skill
---
Instructions.`,
      extraFiles: { "skills/my-local-skill/index.md": "skill content" },
    });

    // Relative paths are resolved absolutely — not checked as bundled plain names
    await expect(readPackagedRole(pkgDir)).resolves.toBeDefined();
  });
});
