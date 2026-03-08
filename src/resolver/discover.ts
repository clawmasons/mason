import * as fs from "node:fs";
import * as path from "node:path";
import { parseChapterField } from "../schemas/index.js";
import type { DiscoveredPackage } from "./types.js";

const WORKSPACE_DIRS = ["apps", "tasks", "skills", "roles", "agents"];

/**
 * Try to read and parse a chapter package from a directory.
 * Returns null if the directory doesn't contain a valid chapter package.
 */
function tryReadPackage(dirPath: string): DiscoveredPackage | null {
  const pkgJsonPath = path.join(dirPath, "package.json");
  if (!fs.existsSync(pkgJsonPath)) {
    return null;
  }

  let pkgJson: { name?: string; version?: string; chapter?: unknown };
  try {
    pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
  } catch {
    return null;
  }

  if (!pkgJson.name || !pkgJson.chapter) {
    return null;
  }

  const result = parseChapterField(pkgJson.chapter);
  if (!result.success) {
    return null;
  }

  return {
    name: pkgJson.name,
    version: pkgJson.version ?? "0.0.0",
    packagePath: dirPath,
    chapterField: result.data,
  };
}

/**
 * Scan a workspace type directory (e.g., apps/, tasks/) for chapter packages.
 */
function scanWorkspaceDir(
  rootDir: string,
  dirName: string,
  packages: Map<string, DiscoveredPackage>,
): void {
  const dirPath = path.join(rootDir, dirName);
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    return;
  }

  for (const entry of fs.readdirSync(dirPath)) {
    const entryPath = path.join(dirPath, entry);
    if (!fs.statSync(entryPath).isDirectory()) {
      continue;
    }
    const pkg = tryReadPackage(entryPath);
    if (pkg) {
      packages.set(pkg.name, pkg);
    }
  }
}

/**
 * Scan node_modules for chapter packages, including scoped packages.
 */
function scanNodeModules(
  rootDir: string,
  packages: Map<string, DiscoveredPackage>,
): void {
  const nodeModulesPath = path.join(rootDir, "node_modules");
  if (!fs.existsSync(nodeModulesPath) || !fs.statSync(nodeModulesPath).isDirectory()) {
    return;
  }

  for (const entry of fs.readdirSync(nodeModulesPath)) {
    const entryPath = path.join(nodeModulesPath, entry);

    // Handle scoped packages (@org/pkg)
    if (entry.startsWith("@") && fs.statSync(entryPath).isDirectory()) {
      for (const scopedEntry of fs.readdirSync(entryPath)) {
        const scopedPath = path.join(entryPath, scopedEntry);
        if (!fs.statSync(scopedPath).isDirectory()) {
          continue;
        }
        const pkg = tryReadPackage(scopedPath);
        if (pkg && !packages.has(pkg.name)) {
          packages.set(pkg.name, pkg);
        }
      }
      continue;
    }

    // Skip hidden directories and non-directories
    if (entry.startsWith(".") || !fs.statSync(entryPath).isDirectory()) {
      continue;
    }

    const pkg = tryReadPackage(entryPath);
    if (pkg && !packages.has(pkg.name)) {
      packages.set(pkg.name, pkg);
    }
  }
}

/**
 * Discover all chapter packages in the workspace and node_modules.
 * Workspace packages take precedence over node_modules versions.
 */
export function discoverPackages(rootDir: string): Map<string, DiscoveredPackage> {
  const packages = new Map<string, DiscoveredPackage>();

  // Scan workspace directories first (they take precedence)
  for (const dirName of WORKSPACE_DIRS) {
    scanWorkspaceDir(rootDir, dirName, packages);
  }

  // Scan node_modules (skip packages already found in workspace)
  scanNodeModules(rootDir, packages);

  return packages;
}
