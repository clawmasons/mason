/**
 * Tests for role-package-name-resolution and auto-convert behaviors.
 * Uses vi.mock to control getGlobalNpmRoot output.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock getGlobalNpmRoot before importing modules that use it
vi.mock("../src/role/global-npm-root.js", () => ({
  getGlobalNpmRoot: vi.fn().mockResolvedValue(null),
  resetGlobalNpmRootCache: vi.fn(),
}));

import { resolveRole, RoleDiscoveryError } from "@clawmasons/shared";
import { getGlobalNpmRoot } from "../src/role/global-npm-root.js";

const mockGetGlobalNpmRoot = vi.mocked(getGlobalNpmRoot);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir: string;
let globalDir: string;

beforeEach(async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  testDir = join(tmpdir(), `role-disc-pkg-test-${suffix}`);
  globalDir = join(tmpdir(), `role-disc-global-${suffix}`);
  await mkdir(testDir, { recursive: true });
  await mkdir(globalDir, { recursive: true });
  // Default: no global npm root
  mockGetGlobalNpmRoot.mockResolvedValue(null);
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
  await rm(globalDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

/** Create a role package in a given node_modules directory. */
async function createRolePackage(opts: {
  nodeModulesDir: string;
  packageName: string;
  roleName: string;
  description?: string;
}): Promise<string> {
  const pkgDir = join(opts.nodeModulesDir, opts.packageName);
  await mkdir(pkgDir, { recursive: true });

  const pkgJson = {
    name: opts.packageName,
    version: "1.0.0",
    chapter: { type: "role" },
  };
  await writeFile(join(pkgDir, "package.json"), JSON.stringify(pkgJson));

  const roleMd = `---
name: ${opts.roleName}
description: ${opts.description ?? `${opts.roleName} role`}
---

Instructions for ${opts.roleName}.`;
  await writeFile(join(pkgDir, "ROLE.md"), roleMd);

  return pkgDir;
}

/** Create a local role in .mason/roles/. */
async function createLocalRole(name: string): Promise<void> {
  const roleDir = join(testDir, ".mason", "roles", name);
  await mkdir(roleDir, { recursive: true });
  await writeFile(
    join(roleDir, "ROLE.md"),
    `---\nname: ${name}\ndescription: local ${name}\n---\n\nLocal instructions.`,
  );
}

// ---------------------------------------------------------------------------
// Package name direct lookup (scoped names)
// ---------------------------------------------------------------------------

describe("resolveRole — direct package name lookup", () => {
  it("resolves a scoped package name from local node_modules", async () => {
    const localNm = join(testDir, "node_modules");
    await createRolePackage({
      nodeModulesDir: localNm,
      packageName: "@clawmasons/role-configure-project",
      roleName: "configure-project",
    });

    const role = await resolveRole(
      "@clawmasons/role-configure-project",
      testDir,
    );
    expect(role.metadata.name).toBe("configure-project");
    expect(role.source.type).toBe("package");
  });

  it("skips .mason/roles/ when name is a package name", async () => {
    // Create a local role that would match if .mason/roles/ was searched
    await createLocalRole("@clawmasons/role-ghost");

    // Should throw because the package doesn't exist — not fall back to local
    await expect(
      resolveRole("@clawmasons/role-ghost", testDir),
    ).rejects.toThrow(RoleDiscoveryError);
  });

  it("falls back to global node_modules when not in local", async () => {
    mockGetGlobalNpmRoot.mockResolvedValue(globalDir);

    await createRolePackage({
      nodeModulesDir: globalDir,
      packageName: "@clawmasons/role-global-only",
      roleName: "global-only",
    });

    const role = await resolveRole("@clawmasons/role-global-only", testDir);
    expect(role.metadata.name).toBe("global-only");
  });

  it("throws RoleDiscoveryError with package name when not found anywhere", async () => {
    mockGetGlobalNpmRoot.mockResolvedValue(globalDir);

    await expect(
      resolveRole("@clawmasons/role-nonexistent", testDir),
    ).rejects.toThrow(RoleDiscoveryError);

    await expect(
      resolveRole("@clawmasons/role-nonexistent", testDir),
    ).rejects.toThrow("@clawmasons/role-nonexistent");
  });
});

// ---------------------------------------------------------------------------
// Auto-convert plain names to @clawmasons/role-<name>
// ---------------------------------------------------------------------------

describe("resolveRole — auto-convert plain name to clawmasons package", () => {
  it("resolves plain name via @clawmasons/role-<name> in local node_modules", async () => {
    const localNm = join(testDir, "node_modules");
    // No local .mason/roles/configure-project, no package with metadata name "configure-project"
    // But @clawmasons/role-configure-project exists
    await createRolePackage({
      nodeModulesDir: localNm,
      packageName: "@clawmasons/role-configure-project",
      roleName: "configure-project",
    });

    const role = await resolveRole("configure-project", testDir);
    expect(role.metadata.name).toBe("configure-project");
  });

  it("checks global node_modules for auto-converted name when local absent", async () => {
    mockGetGlobalNpmRoot.mockResolvedValue(globalDir);

    await createRolePackage({
      nodeModulesDir: globalDir,
      packageName: "@clawmasons/role-my-role",
      roleName: "my-role",
    });

    const role = await resolveRole("my-role", testDir);
    expect(role.metadata.name).toBe("my-role");
  });

  it("throws with mention of auto-converted name when nothing found", async () => {
    await expect(
      resolveRole("nonexistent-role", testDir),
    ).rejects.toThrow("@clawmasons/role-nonexistent-role");
  });
});

// ---------------------------------------------------------------------------
// Local role precedence
// ---------------------------------------------------------------------------

describe("resolveRole — local role takes precedence over package", () => {
  it("returns local role even when package with same name exists", async () => {
    await createLocalRole("configure-project");

    const localNm = join(testDir, "node_modules");
    await createRolePackage({
      nodeModulesDir: localNm,
      packageName: "@clawmasons/role-configure-project",
      roleName: "configure-project",
    });

    const role = await resolveRole("configure-project", testDir);
    expect(role.source.type).toBe("local");
  });
});

// ---------------------------------------------------------------------------
// npm root -g failure does not break resolution
// ---------------------------------------------------------------------------

describe("resolveRole — npm root -g failure", () => {
  it("resolves a local role even when getGlobalNpmRoot rejects", async () => {
    mockGetGlobalNpmRoot.mockRejectedValue(new Error("npm not found"));
    await createLocalRole("my-role");

    // Should still work via local role
    const role = await resolveRole("my-role", testDir);
    expect(role.metadata.name).toBe("my-role");
  });

  it("resolves a local package role even when getGlobalNpmRoot rejects", async () => {
    mockGetGlobalNpmRoot.mockRejectedValue(new Error("npm not found"));

    const localNm = join(testDir, "node_modules");
    await createRolePackage({
      nodeModulesDir: localNm,
      packageName: "@clawmasons/role-configure-project",
      roleName: "configure-project",
    });

    const role = await resolveRole(
      "@clawmasons/role-configure-project",
      testDir,
    );
    expect(role.metadata.name).toBe("configure-project");
  });
});
