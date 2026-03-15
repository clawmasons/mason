import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  discoverRoles,
  resolveRole,
  RoleDiscoveryError,
} from "@clawmasons/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir: string;

beforeEach(async () => {
  testDir = join(
    tmpdir(),
    `role-disc-test-${Date.now()}-${Math.random().toString(36).substring(7)}`,
  );
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

/** Create a local role in .mason/roles/. */
async function createLocalRole(opts: {
  name: string;
  description?: string;
  extraFrontmatter?: string;
  body?: string;
}): Promise<string> {
  const roleDir = join(testDir, ".mason", "roles", opts.name);
  await mkdir(roleDir, { recursive: true });

  const roleMd = `---
name: ${opts.name}
description: ${opts.description ?? `${opts.name} role`}
tasks:
  - task-one
${opts.extraFrontmatter ?? ""}
---

${opts.body ?? `Instructions for ${opts.name}.`}`;

  await writeFile(join(roleDir, "ROLE.md"), roleMd);
  return roleDir;
}

/** Create a mock NPM role package in node_modules. */
async function createPackagedRole(opts: {
  packageName: string;
  roleName: string;
  description?: string;
  extraFrontmatter?: string;
  body?: string;
}): Promise<string> {
  const pkgDir = join(testDir, "node_modules", opts.packageName);
  await mkdir(pkgDir, { recursive: true });

  const pkgJson = {
    name: opts.packageName,
    version: "1.0.0",
    chapter: { type: "role" },
  };
  await writeFile(
    join(pkgDir, "package.json"),
    JSON.stringify(pkgJson, null, 2),
  );

  const roleMd = `---
name: ${opts.roleName}
description: ${opts.description ?? `${opts.roleName} packaged role`}
${opts.extraFrontmatter ?? ""}
---

${opts.body ?? `Packaged instructions for ${opts.roleName}.`}`;

  await writeFile(join(pkgDir, "ROLE.md"), roleMd);
  return pkgDir;
}

/** Create a non-role NPM package (to verify it's excluded). */
async function createNonRolePackage(packageName: string): Promise<void> {
  const pkgDir = join(testDir, "node_modules", packageName);
  await mkdir(pkgDir, { recursive: true });
  await writeFile(
    join(pkgDir, "package.json"),
    JSON.stringify({ name: packageName, version: "1.0.0", chapter: { type: "skill" } }),
  );
}

// ---------------------------------------------------------------------------
// discoverRoles — local roles
// ---------------------------------------------------------------------------

describe("discoverRoles — local roles", () => {
  it("discovers a local role from .mason/roles/", async () => {
    await createLocalRole({ name: "my-role" });

    const roles = await discoverRoles(testDir);
    expect(roles).toHaveLength(1);
    expect(roles[0].metadata.name).toBe("my-role");
    expect(roles[0].source.type).toBe("local");
    expect(roles[0].source.agentDialect).toBe("mason");
  });

  it("discovers multiple roles in .mason/roles/", async () => {
    await createLocalRole({ name: "role-a" });
    await createLocalRole({ name: "role-b" });

    const roles = await discoverRoles(testDir);
    expect(roles).toHaveLength(2);

    const names = roles.map((r) => r.metadata.name).sort();
    expect(names).toEqual(["role-a", "role-b"]);
  });

  it("does not discover roles from .claude/roles/", async () => {
    // Place a ROLE.md in the old location — should NOT be discovered
    const claudeRoleDir = join(testDir, ".claude", "roles", "old-role");
    await mkdir(claudeRoleDir, { recursive: true });
    await writeFile(
      join(claudeRoleDir, "ROLE.md"),
      "---\nname: old-role\ndescription: Old role\n---\n\nInstructions.",
    );

    const roles = await discoverRoles(testDir);
    expect(roles).toEqual([]);
  });

  it("does not discover roles from .codex/roles/", async () => {
    const codexRoleDir = join(testDir, ".codex", "roles", "codex-role");
    await mkdir(codexRoleDir, { recursive: true });
    await writeFile(
      join(codexRoleDir, "ROLE.md"),
      "---\nname: codex-role\ndescription: Codex role\n---\n\nInstructions.",
    );

    const roles = await discoverRoles(testDir);
    expect(roles).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// discoverRoles — packaged roles
// ---------------------------------------------------------------------------

describe("discoverRoles — packaged roles", () => {
  it("discovers a packaged role from node_modules", async () => {
    await createPackagedRole({
      packageName: "role-test-pkg",
      roleName: "test-pkg",
    });

    const roles = await discoverRoles(testDir);
    expect(roles).toHaveLength(1);
    expect(roles[0].metadata.name).toBe("test-pkg");
    expect(roles[0].source.type).toBe("package");
    expect(roles[0].source.packageName).toBe("role-test-pkg");
  });

  it("discovers scoped packaged roles from node_modules/@scope/", async () => {
    await createPackagedRole({
      packageName: "@acme/role-scoped",
      roleName: "scoped-role",
    });

    const roles = await discoverRoles(testDir);
    expect(roles).toHaveLength(1);
    expect(roles[0].metadata.name).toBe("scoped-role");
    expect(roles[0].source.packageName).toBe("@acme/role-scoped");
  });

  it("excludes non-role packages from discovery", async () => {
    await createPackagedRole({
      packageName: "real-role",
      roleName: "real",
    });
    await createNonRolePackage("not-a-role");

    const roles = await discoverRoles(testDir);
    expect(roles).toHaveLength(1);
    expect(roles[0].metadata.name).toBe("real");
  });

  it("discovers multiple packaged roles", async () => {
    await createPackagedRole({ packageName: "role-a", roleName: "pkg-a" });
    await createPackagedRole({ packageName: "role-b", roleName: "pkg-b" });
    await createPackagedRole({
      packageName: "@scope/role-c",
      roleName: "pkg-c",
    });

    const roles = await discoverRoles(testDir);
    expect(roles).toHaveLength(3);

    const names = roles.map((r) => r.metadata.name).sort();
    expect(names).toEqual(["pkg-a", "pkg-b", "pkg-c"]);
  });
});

// ---------------------------------------------------------------------------
// discoverRoles — precedence
// ---------------------------------------------------------------------------

describe("discoverRoles — local-over-package precedence", () => {
  it("local role shadows packaged role with the same name", async () => {
    await createLocalRole({
      name: "my-role",
      description: "Local version",
    });
    await createPackagedRole({
      packageName: "role-my-role",
      roleName: "my-role",
      description: "Packaged version",
    });

    const roles = await discoverRoles(testDir);
    expect(roles).toHaveLength(1);
    expect(roles[0].metadata.name).toBe("my-role");
    expect(roles[0].metadata.description).toBe("Local version");
    expect(roles[0].source.type).toBe("local");
  });

  it("includes both local and packaged roles with different names", async () => {
    await createLocalRole({ name: "local-only" });
    await createPackagedRole({
      packageName: "role-pkg-only",
      roleName: "pkg-only",
    });

    const roles = await discoverRoles(testDir);
    expect(roles).toHaveLength(2);

    const names = roles.map((r) => r.metadata.name).sort();
    expect(names).toEqual(["local-only", "pkg-only"]);
  });
});

// ---------------------------------------------------------------------------
// discoverRoles — edge cases
// ---------------------------------------------------------------------------

describe("discoverRoles — edge cases", () => {
  it("returns empty array when no roles exist", async () => {
    const roles = await discoverRoles(testDir);
    expect(roles).toEqual([]);
  });

  it("returns empty array when .mason/roles/ does not exist", async () => {
    await mkdir(join(testDir, ".mason"), { recursive: true });

    const roles = await discoverRoles(testDir);
    expect(roles).toEqual([]);
  });

  it("skips directories without ROLE.md", async () => {
    const emptyRoleDir = join(testDir, ".mason", "roles", "empty-role");
    await mkdir(emptyRoleDir, { recursive: true });
    await writeFile(join(emptyRoleDir, "README.md"), "Not a ROLE.md");

    const roles = await discoverRoles(testDir);
    expect(roles).toEqual([]);
  });

  it("skips malformed ROLE.md files during discovery", async () => {
    await createLocalRole({ name: "valid-role" });

    const badRoleDir = join(testDir, ".mason", "roles", "bad-role");
    await mkdir(badRoleDir, { recursive: true });
    await writeFile(join(badRoleDir, "ROLE.md"), "not valid frontmatter at all");

    const roles = await discoverRoles(testDir);
    expect(roles).toHaveLength(1);
    expect(roles[0].metadata.name).toBe("valid-role");
  });

  it("handles no node_modules directory gracefully", async () => {
    await createLocalRole({ name: "local-role" });

    const roles = await discoverRoles(testDir);
    expect(roles).toHaveLength(1);
    expect(roles[0].metadata.name).toBe("local-role");
  });
});

// ---------------------------------------------------------------------------
// resolveRole
// ---------------------------------------------------------------------------

describe("resolveRole", () => {
  it("resolves a local role by name from .mason/roles/", async () => {
    await createLocalRole({ name: "target-role" });

    const role = await resolveRole("target-role", testDir);
    expect(role.metadata.name).toBe("target-role");
    expect(role.source.type).toBe("local");
  });

  it("resolves a packaged role by name", async () => {
    await createPackagedRole({
      packageName: "role-target",
      roleName: "target-role",
    });

    const role = await resolveRole("target-role", testDir);
    expect(role.metadata.name).toBe("target-role");
    expect(role.source.type).toBe("package");
  });

  it("prefers local role over packaged role with the same name", async () => {
    await createLocalRole({
      name: "shared-name",
      description: "Local version",
    });
    await createPackagedRole({
      packageName: "role-shared-name",
      roleName: "shared-name",
      description: "Packaged version",
    });

    const role = await resolveRole("shared-name", testDir);
    expect(role.metadata.description).toBe("Local version");
    expect(role.source.type).toBe("local");
  });

  it("throws RoleDiscoveryError when role is not found", async () => {
    await expect(
      resolveRole("nonexistent", testDir),
    ).rejects.toThrow(RoleDiscoveryError);
    await expect(
      resolveRole("nonexistent", testDir),
    ).rejects.toThrow('Role "nonexistent" not found');
  });

  it("does not resolve a role from .claude/roles/", async () => {
    const claudeRoleDir = join(testDir, ".claude", "roles", "old-role");
    await mkdir(claudeRoleDir, { recursive: true });
    await writeFile(
      join(claudeRoleDir, "ROLE.md"),
      "---\nname: old-role\ndescription: Old role\n---\n\nInstructions.",
    );

    await expect(
      resolveRole("old-role", testDir),
    ).rejects.toThrow(RoleDiscoveryError);
  });
});
