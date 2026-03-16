/**
 * Unified Role Discovery — finds roles from all sources, merges with
 * precedence rules, and presents a unified list.
 *
 * Discovery sources (in precedence order):
 * 1. Local roles: <projectDir>/.<agent>/roles/* /ROLE.md
 * 2. Packaged roles: node_modules packages with chapter.type === "role"
 *
 * Local roles shadow packaged roles with the same name, enabling the
 * "eject and customize" workflow (PRD §6.3).
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { readMaterializedRole } from "./parser.js";
import { readPackagedRole } from "./package-reader.js";
import type { Role } from "../types/role.js";

/**
 * Error thrown when role discovery or resolution fails.
 */
export class RoleDiscoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoleDiscoveryError";
  }
}

/**
 * Discover all available roles from local agent directories and installed
 * NPM packages. Local roles take precedence over packaged roles with the
 * same name.
 *
 * @param projectDir - Absolute path to the project root
 * @returns Array of validated Role objects (deduplicated by name)
 */
export async function discoverRoles(projectDir: string): Promise<Role[]> {
  const localRoles = await discoverLocalRoles(projectDir);
  const packagedRoles = await discoverPackagedRoles(projectDir);

  // Merge: local roles take precedence over packaged roles with the same name
  const merged = new Map<string, Role>();

  // Add packaged roles first (lower precedence)
  for (const role of packagedRoles) {
    merged.set(role.metadata.name, role);
  }

  // Add local roles second (higher precedence — overwrites packaged)
  for (const role of localRoles) {
    merged.set(role.metadata.name, role);
  }

  return [...merged.values()];
}

/**
 * Resolve a single role by name using the same precedence rules as
 * discoverRoles. Checks local roles first, then packaged roles.
 *
 * @param name - Role name to resolve
 * @param projectDir - Absolute path to the project root
 * @returns Validated Role
 * @throws RoleDiscoveryError if the role is not found
 */
export async function resolveRole(
  name: string,
  projectDir: string,
): Promise<Role> {
  // 1. Check local roles first (higher precedence)
  const localRole = await findLocalRole(name, projectDir);
  if (localRole) return localRole;

  // 2. Check packaged roles
  const packagedRole = await findPackagedRole(name, projectDir);
  if (packagedRole) return packagedRole;

  throw new RoleDiscoveryError(
    `Role "${name}" not found. It is not a local role and is not installed as a package.`,
  );
}

// ---------------------------------------------------------------------------
// Local role discovery
// ---------------------------------------------------------------------------

/**
 * Scan .mason/roles/ for local ROLE.md files.
 * Silently skips the directory if it doesn't exist.
 */
async function discoverLocalRoles(projectDir: string): Promise<Role[]> {
  const roles: Role[] = [];
  const rolesDir = join(projectDir, ".mason", "roles");

  let entries: string[];
  try {
    entries = await readdir(rolesDir);
  } catch {
    // .mason/roles/ doesn't exist — no local roles
    return roles;
  }

  for (const entry of entries) {
    const roleMdPath = join(rolesDir, entry, "ROLE.md");
    try {
      const s = await stat(roleMdPath);
      if (!s.isFile()) continue;
    } catch {
      // No ROLE.md in this subdirectory — skip
      continue;
    }

    try {
      const role = await readMaterializedRole(roleMdPath);
      roles.push(role);
    } catch {
      // Malformed ROLE.md — skip during discovery (log would go here)
      continue;
    }
  }

  return roles;
}

/**
 * Find a specific local role by name in .mason/roles/.
 */
async function findLocalRole(
  name: string,
  projectDir: string,
): Promise<Role | undefined> {
  const roleMdPath = join(projectDir, ".mason", "roles", name, "ROLE.md");
  try {
    const s = await stat(roleMdPath);
    if (!s.isFile()) return undefined;
  } catch {
    return undefined;
  }

  try {
    return await readMaterializedRole(roleMdPath);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Packaged role discovery
// ---------------------------------------------------------------------------

/**
 * Scan node_modules for packages with chapter.type === "role".
 * Checks both top-level and scoped package directories.
 */
async function discoverPackagedRoles(projectDir: string): Promise<Role[]> {
  const roles: Role[] = [];
  const nodeModulesDir = join(projectDir, "node_modules");

  let topLevel: string[];
  try {
    topLevel = await readdir(nodeModulesDir);
  } catch {
    // No node_modules — no packaged roles
    return roles;
  }

  const packageDirs: string[] = [];

  for (const entry of topLevel) {
    if (entry.startsWith(".")) continue;

    const entryPath = join(nodeModulesDir, entry);

    if (entry.startsWith("@")) {
      // Scoped packages: read the scope directory
      let scopedEntries: string[];
      try {
        scopedEntries = await readdir(entryPath);
      } catch {
        continue;
      }
      for (const scopedEntry of scopedEntries) {
        if (!scopedEntry.startsWith(".")) {
          packageDirs.push(join(entryPath, scopedEntry));
        }
      }
    } else {
      packageDirs.push(entryPath);
    }
  }

  for (const pkgDir of packageDirs) {
    if (await isRolePackage(pkgDir)) {
      try {
        const role = await readPackagedRole(pkgDir);
        roles.push(role);
      } catch {
        // Malformed package — skip during discovery
        continue;
      }
    }
  }

  return roles;
}

/**
 * Find a specific packaged role by name.
 */
async function findPackagedRole(
  name: string,
  projectDir: string,
): Promise<Role | undefined> {
  // First, try to find it among all packaged roles
  const packagedRoles = await discoverPackagedRoles(projectDir);
  return packagedRoles.find((r) => r.metadata.name === name);
}

/**
 * Check if a directory is an NPM package with chapter.type === "role".
 */
async function isRolePackage(pkgDir: string): Promise<boolean> {
  const pkgJsonPath = join(pkgDir, "package.json");
  try {
    const raw = await readFile(pkgJsonPath, "utf-8");
    const pkg = JSON.parse(raw) as {
      chapter?: { type?: string };
    };
    return pkg.chapter?.type === "role";
  } catch {
    return false;
  }
}
