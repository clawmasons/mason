/**
 * Unified Role Discovery — finds roles from all sources, merges with
 * precedence rules, and presents a unified list.
 *
 * Discovery sources (in precedence order):
 * 1. Local roles: <projectDir>/.mason/roles/<name>/ROLE.md
 * 2. Packaged roles: node_modules packages with metadata type === "role"
 *
 * Local roles shadow packaged roles with the same name, enabling the
 * "eject and customize" workflow (PRD §6.3).
 *
 * resolveRole additionally supports:
 * - Direct package name lookup (e.g., "@clawmasons/role-configure-project")
 * - Auto-conversion of plain names to @clawmasons/role-<name>
 * - Global node_modules fallback via `npm root -g`
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { readMaterializedRole } from "./parser.js";
import { readPackagedRole } from "./package-reader.js";
import { getGlobalNpmRoot } from "./global-npm-root.js";
import type { Role } from "../types/role.js";
import { CLI_NAME_LOWERCASE } from "../constants.js";

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
 * Resolve a single role by name.
 *
 * Resolution strategy:
 * - If the name looks like a package name (contains @ or /):
 *   1. Direct lookup in local node_modules/<name>
 *   2. Direct lookup in global node_modules/<name>
 *   3. Throw if not found
 * - Otherwise (plain name):
 *   1. Check local .mason/roles/<name>/ROLE.md
 *   2. Full node_modules scan by metadata name
 *   3. Direct lookup as @clawmasons/role-<name> (local then global)
 *   4. Throw if not found
 *
 * @param name - Role name or npm package name to resolve
 * @param projectDir - Absolute path to the project root
 * @returns Validated Role
 * @throws RoleDiscoveryError if the role is not found
 */
export async function resolveRole(
  name: string,
  projectDir: string,
): Promise<Role> {
  if (isPackageName(name)) {
    // Direct package lookup — skip local role scan
    const localNodeModules = join(projectDir, "node_modules");
    const fromLocal = await lookupPackageByName(name, localNodeModules);
    if (fromLocal) return fromLocal;

    const globalNodeModules = await safeGetGlobalNpmRoot();
    if (globalNodeModules) {
      const fromGlobal = await lookupPackageByName(name, globalNodeModules);
      if (fromGlobal) return fromGlobal;
    }

    const globalPath = globalNodeModules
      ? ` or ${join(globalNodeModules, name)}`
      : "";
    throw new RoleDiscoveryError(
      `Role package "${name}" not found in ${join(localNodeModules, name)}${globalPath}.`,
    );
  }

  // Plain name — check local, then full scan, then auto-convert
  const localRole = await findLocalRole(name, projectDir);
  if (localRole) return localRole;

  const packagedRole = await findPackagedRole(name, projectDir);
  if (packagedRole) return packagedRole;

  // Auto-convert: try @clawmasons/role-<name>
  const autoPackageName = `@clawmasons/role-${name}`;
  const localNodeModules = join(projectDir, "node_modules");
  const fromLocal = await lookupPackageByName(autoPackageName, localNodeModules);
  if (fromLocal) return fromLocal;

  const globalNodeModules = await safeGetGlobalNpmRoot();
  if (globalNodeModules) {
    const fromGlobal = await lookupPackageByName(autoPackageName, globalNodeModules);
    if (fromGlobal) return fromGlobal;
  }

  throw new RoleDiscoveryError(
    `Role "${name}" not found. It is not a local role and is not installed as a package (also tried "${autoPackageName}").`,
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[mason] Skipping invalid ROLE.md at ${roleMdPath}: ${msg}`);
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[mason] Invalid ROLE.md at ${roleMdPath}: ${msg}`);
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Packaged role discovery
// ---------------------------------------------------------------------------

/**
 * Scan node_modules for packages with metadata type === "role".
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
 * Find a specific packaged role by metadata name (full scan).
 */
async function findPackagedRole(
  name: string,
  projectDir: string,
): Promise<Role | undefined> {
  const packagedRoles = await discoverPackagedRoles(projectDir);
  return packagedRoles.find((r) => r.metadata.name === name);
}

/**
 * Check if a directory is an NPM package with metadata type === "role".
 */
async function isRolePackage(pkgDir: string): Promise<boolean> {
  const pkgJsonPath = join(pkgDir, "package.json");
  try {
    const raw = await readFile(pkgJsonPath, "utf-8");
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    const metadata = pkg[CLI_NAME_LOWERCASE] as { type?: string } | undefined;
    return metadata?.type === "role";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Package name helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the name looks like an npm package name (contains @ or /).
 * This distinguishes package names like "@clawmasons/role-foo" from plain
 * role names like "configure-project".
 */
function isPackageName(name: string): boolean {
  return name.includes("@") || name.includes("/");
}

/** Silently get global node_modules path, returning null on any failure. */
async function safeGetGlobalNpmRoot(): Promise<string | null> {
  try {
    return await getGlobalNpmRoot();
  } catch {
    return null;
  }
}

/**
 * Attempt to load a role package by its npm package name from a specific
 * node_modules directory. Returns undefined if not found or not a role package.
 *
 * @param packageName - npm package name (e.g., "@clawmasons/role-configure-project")
 * @param nodeModulesDir - absolute path to a node_modules directory
 */
async function lookupPackageByName(
  packageName: string,
  nodeModulesDir: string,
): Promise<Role | undefined> {
  const pkgDir = join(nodeModulesDir, packageName);
  if (!(await isRolePackage(pkgDir))) return undefined;
  try {
    return await readPackagedRole(pkgDir);
  } catch {
    return undefined;
  }
}
