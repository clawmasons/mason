/**
 * Populates the proxy Docker build context with required node_modules.
 *
 * The proxy Dockerfile at `{role}/mcp-proxy/Dockerfile` expects `package.json`
 * and `node_modules/` to be available in the Docker build context root
 * (`.clawmasons/docker/`).
 *
 * This module resolves framework packages and their transitive production
 * dependencies from the host's node_modules, copies them into the Docker
 * build directory, and creates `.bin/` symlinks.
 *
 * @module proxy-dependencies
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Root of the @clawmasons/cli package (two levels up from materializer/).
 * Used as a starting point for resolving framework packages.
 */
const CLI_PACKAGE_ROOT = path.resolve(__dirname, "../..");

/** Framework packages the proxy image needs at runtime. */
const FRAMEWORK_PACKAGES = [
  "@clawmasons/chapter",
  "@clawmasons/proxy",
  "@clawmasons/shared",
  "@clawmasons/credential-service",
  "@clawmasons/mcp-agent",
];

// ---------------------------------------------------------------------------
// Package Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a package directory by walking up from each start directory,
 * checking `node_modules/<packageName>` at each level.
 *
 * Returns the real path (symlinks resolved) or null if not found.
 */
function resolvePackageDir(
  packageName: string,
  searchDirs: string[],
): string | null {
  for (const startDir of searchDirs) {
    let dir = startDir;
    for (;;) {
      const candidate = path.join(dir, "node_modules", packageName);
      if (fs.existsSync(candidate)) {
        try {
          return fs.realpathSync(candidate);
        } catch {
          return candidate;
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

/**
 * BFS-collect all packages: start with FRAMEWORK_PACKAGES, then traverse
 * each package's `dependencies` (production only) to gather transitive deps.
 *
 * @returns Map of package name → resolved absolute directory path.
 */
function collectPackages(
  searchDirs: string[],
): Map<string, string> {
  const resolved = new Map<string, string>();
  const visited = new Set<string>();
  const queue = [...FRAMEWORK_PACKAGES];

  while (queue.length > 0) {
    const pkg = queue.shift() as string;
    if (visited.has(pkg)) continue;
    visited.add(pkg);

    const pkgDir = resolvePackageDir(pkg, searchDirs);
    if (!pkgDir) continue;

    resolved.set(pkg, pkgDir);

    // Enqueue production dependencies
    const pkgJsonPath = path.join(pkgDir, "package.json");
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
        for (const dep of Object.keys(pkgJson.dependencies ?? {})) {
          if (!visited.has(dep)) {
            queue.push(dep);
          }
        }
      } catch {
        // Skip packages with unreadable package.json
      }
    }
  }

  return resolved;
}

// ---------------------------------------------------------------------------
// Copying
// ---------------------------------------------------------------------------

/**
 * Copy resolved packages into the target `node_modules/` directory.
 * Uses `fs.cpSync` with `dereference: true` to handle monorepo symlinks.
 */
function copyPackages(
  packages: Map<string, string>,
  targetNodeModules: string,
): void {
  for (const [pkgName, srcDir] of packages) {
    const destDir = path.join(targetNodeModules, pkgName);
    fs.mkdirSync(path.dirname(destDir), { recursive: true });

    // Skip if already exists (idempotent)
    if (fs.existsSync(destDir)) continue;

    fs.cpSync(srcDir, destDir, {
      recursive: true,
      dereference: true,
    });
  }
}

/**
 * Scan for nested `node_modules/` inside copied packages and ensure their
 * dependencies are also available at the top-level `node_modules/`.
 *
 * Some packages (e.g., `ajv-formats`, `@modelcontextprotocol/sdk`) ship with
 * nested `node_modules/` containing version-pinned sub-deps.  Those sub-deps
 * may reference packages resolved from higher-level `node_modules/` that we
 * haven't copied yet.  This function copies any missing deps to the top level.
 */
function hoistNestedDependencies(
  targetNodeModules: string,
  searchDirs: string[],
): void {
  const queue: string[] = [targetNodeModules];
  const processed = new Set<string>();

  while (queue.length > 0) {
    const nmDir = queue.shift() as string;
    if (processed.has(nmDir)) continue;
    processed.add(nmDir);

    if (!fs.existsSync(nmDir)) continue;

    // Walk all packages in this node_modules
    for (const entry of walkScopedPackages(nmDir)) {
      const pkgJsonPath = path.join(entry.dir, "package.json");
      if (!fs.existsSync(pkgJsonPath)) continue;

      // Check for nested node_modules to recurse into
      const nestedNm = path.join(entry.dir, "node_modules");
      if (fs.existsSync(nestedNm)) {
        queue.push(nestedNm);
      }

      // Read dependencies and ensure they exist at top level
      try {
        const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
        for (const dep of Object.keys(pkgJson.dependencies ?? {})) {
          const topLevelDest = path.join(targetNodeModules, dep);
          if (fs.existsSync(topLevelDest)) continue;

          // Try to find the dep in the host's node_modules
          const srcDir = resolvePackageDir(dep, searchDirs);
          if (!srcDir) continue;

          fs.mkdirSync(path.dirname(topLevelDest), { recursive: true });
          fs.cpSync(srcDir, topLevelDest, {
            recursive: true,
            dereference: true,
          });

          // Recurse into this newly copied package's node_modules
          const newNestedNm = path.join(topLevelDest, "node_modules");
          if (fs.existsSync(newNestedNm)) {
            queue.push(newNestedNm);
          }
        }
      } catch {
        // Skip
      }
    }
  }
}

/**
 * Create `.bin/` symlinks for packages that declare `bin` entries
 * in their `package.json`.
 */
function createBinLinks(targetNodeModules: string): void {
  const binDir = path.join(targetNodeModules, ".bin");
  fs.mkdirSync(binDir, { recursive: true });

  // Walk all packages in node_modules looking for bin entries
  for (const entry of walkScopedPackages(targetNodeModules)) {
    const pkgJsonPath = path.join(entry.dir, "package.json");
    if (!fs.existsSync(pkgJsonPath)) continue;

    try {
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
      if (!pkgJson.bin) continue;

      const bins: Record<string, string> =
        typeof pkgJson.bin === "string"
          ? { [pkgJson.name?.split("/").pop() ?? entry.name]: pkgJson.bin }
          : pkgJson.bin;

      for (const [binName, binPath] of Object.entries(bins)) {
        const target = path.resolve(entry.dir, binPath);
        const link = path.join(binDir, binName);
        if (fs.existsSync(link)) continue;

        try {
          const relTarget = path.relative(binDir, target);
          fs.symlinkSync(relTarget, link);
          fs.chmodSync(target, 0o755);
        } catch {
          // Best effort — skip if symlink fails
        }
      }
    } catch {
      // Skip packages with unreadable package.json
    }
  }
}

/**
 * Iterate over all packages in node_modules, including scoped packages.
 */
function* walkScopedPackages(
  nodeModulesDir: string,
): Generator<{ name: string; dir: string }> {
  if (!fs.existsSync(nodeModulesDir)) return;

  for (const entry of fs.readdirSync(nodeModulesDir, { withFileTypes: true })) {
    if (entry.name === ".bin" || entry.name === ".cache") continue;

    if (entry.name.startsWith("@") && entry.isDirectory()) {
      // Scoped package
      const scopeDir = path.join(nodeModulesDir, entry.name);
      for (const subEntry of fs.readdirSync(scopeDir, { withFileTypes: true })) {
        if (subEntry.isDirectory()) {
          yield {
            name: `${entry.name}/${subEntry.name}`,
            dir: path.join(scopeDir, subEntry.name),
          };
        }
      }
    } else if (entry.isDirectory()) {
      yield { name: entry.name, dir: path.join(nodeModulesDir, entry.name) };
    }
  }
}

// ---------------------------------------------------------------------------
// Workspace Packages
// ---------------------------------------------------------------------------

/**
 * Copy workspace packages (roles, apps, tasks, skills) from the project
 * directory into the proxy's node_modules.
 *
 * The proxy uses `discoverPackages()` at runtime to find role and app
 * packages in its node_modules.  This function reads the project's
 * `package.json` workspace globs and copies each discovered workspace
 * package into the target node_modules directory.
 */
function copyWorkspacePackages(
  projectDir: string,
  targetNodeModules: string,
): void {
  const pkgJsonPath = path.join(projectDir, "package.json");
  if (!fs.existsSync(pkgJsonPath)) return;

  let rootPkg: { workspaces?: string[] };
  try {
    rootPkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
  } catch {
    return;
  }

  if (!rootPkg.workspaces || rootPkg.workspaces.length === 0) return;

  for (const pattern of rootPkg.workspaces) {
    const parentDir = path.join(projectDir, pattern.replace(/\/?\*$/, ""));
    if (!fs.existsSync(parentDir)) continue;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(parentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const wpkgJsonPath = path.join(parentDir, entry.name, "package.json");
      if (!fs.existsSync(wpkgJsonPath)) continue;

      let wpkg: { name?: string };
      try {
        wpkg = JSON.parse(fs.readFileSync(wpkgJsonPath, "utf-8"));
      } catch {
        continue;
      }

      if (!wpkg.name) continue;

      const destDir = path.join(targetNodeModules, wpkg.name);
      if (fs.existsSync(destDir)) continue;

      const srcDir = path.join(parentDir, entry.name);
      fs.mkdirSync(path.dirname(destDir), { recursive: true });
      fs.cpSync(srcDir, destDir, {
        recursive: true,
        dereference: true,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ensure the proxy Docker build context has all required node_modules.
 *
 * Populates `{dockerDir}/node_modules/` and `{dockerDir}/package.json`
 * with framework packages and their transitive production dependencies.
 *
 * Idempotent: skips if `{dockerDir}/node_modules/@clawmasons/chapter` already
 * exists.
 *
 * @param dockerDir - The Docker build root directory (`.clawmasons/docker/`).
 * @param projectDir - The project root (used as a search path for packages).
 */
export function ensureProxyDependencies(
  dockerDir: string,
  projectDir?: string,
): void {
  const nodeModulesDir = path.join(dockerDir, "node_modules");

  // Idempotent check
  if (fs.existsSync(path.join(nodeModulesDir, "@clawmasons", "chapter"))) {
    return;
  }

  // Search paths: CLI package root first, then project dir, then CWD
  const searchDirs = [CLI_PACKAGE_ROOT];
  if (projectDir) searchDirs.push(projectDir);
  searchDirs.push(process.cwd());

  // 1. Collect all required packages via BFS
  const packages = collectPackages(searchDirs);

  if (packages.size === 0) {
    throw new Error(
      "Could not resolve any framework packages for the proxy Docker build. " +
      "Ensure @clawmasons/chapter is properly installed.",
    );
  }

  // 2. Copy packages to docker node_modules
  fs.mkdirSync(nodeModulesDir, { recursive: true });
  copyPackages(packages, nodeModulesDir);

  // 3. Hoist nested dependencies to top level
  hoistNestedDependencies(nodeModulesDir, searchDirs);

  // 4. Copy workspace packages (roles, apps, tasks, skills)
  if (projectDir) {
    copyWorkspacePackages(projectDir, nodeModulesDir);
  }

  // 5. Create .bin symlinks
  createBinLinks(nodeModulesDir);

  // 6. Generate minimal package.json
  fs.writeFileSync(
    path.join(dockerDir, "package.json"),
    JSON.stringify(
      { name: "clawmasons-proxy", version: "0.0.0", private: true },
      null,
      2,
    ) + "\n",
  );
}
