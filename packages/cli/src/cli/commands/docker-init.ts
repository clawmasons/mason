import type { Command } from "commander";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { getAppShortName } from "@clawmasons/shared";
import type { ResolvedAgent, ResolvedRole } from "@clawmasons/shared";

/** Directory of this source file — fallback resolve root for framework packages. */
const CLI_DIR = path.dirname(fileURLToPath(import.meta.url));
import { discoverPackages } from "../../resolver/discover.js";
import { resolveRolePackage } from "../../resolver/resolve.js";
import { generateProxyDockerfile } from "../../generator/proxy-dockerfile.js";
import { generateAgentDockerfile } from "../../generator/agent-dockerfile.js";
import { generateCredentialServiceDockerfile } from "../../generator/credential-service-dockerfile.js";
import { claudeCodeMaterializer } from "../../materializer/claude-code.js";
import { piCodingAgentMaterializer } from "../../materializer/pi-coding-agent.js";
import { mcpAgentMaterializer } from "../../materializer/mcp-agent.js";
import type { RuntimeMaterializer } from "../../materializer/types.js";

/**
 * Shape of the `.clawmasons/chapter.json` config file.
 */
interface ChapterConfig {
  chapter: string; // "<lodge-slug>.<chapter-slug>"
  version?: string;
}

/**
 * Read and validate `.clawmasons/chapter.json`.
 * Returns the parsed config or throws with a clear error.
 */
export function readChapterConfig(rootDir: string): ChapterConfig {
  const configPath = path.join(rootDir, ".clawmasons", "chapter.json");

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `No .clawmasons/chapter.json found. Run "clawmasons init" first to initialize the workspace.`,
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch {
    throw new Error(
      `.clawmasons/chapter.json is not valid JSON.`,
    );
  }

  if (
    typeof raw !== "object" ||
    raw === null ||
    !("chapter" in raw) ||
    typeof (raw as ChapterConfig).chapter !== "string"
  ) {
    throw new Error(
      `.clawmasons/chapter.json must contain a "chapter" field with the chapter name (e.g., "acme.platform").`,
    );
  }

  const config = raw as ChapterConfig;
  const chapterName = config.chapter;

  if (!chapterName.includes(".") || chapterName.startsWith(".") || chapterName.endsWith(".")) {
    throw new Error(
      `Invalid chapter name "${chapterName}" in .clawmasons/chapter.json. Must be in <lodge>.<chapter> format (e.g., "acme.platform").`,
    );
  }

  return config;
}

/**
 * Create the `docker/package.json` — a minimal manifest for the Docker build context.
 * No dependencies are listed; all packages are copied directly by docker-init.
 */
export function createDockerPackageJson(
  rootDir: string,
  chapterName: string,
): void {
  const dockerDir = path.join(rootDir, "docker");
  fs.mkdirSync(dockerDir, { recursive: true });

  const dockerPkgJson = {
    name: `@${chapterName}/docker`,
    version: "0.0.0",
    private: true,
    description: `Docker build context for ${chapterName} chapter`,
  };

  fs.writeFileSync(
    path.join(dockerDir, "package.json"),
    JSON.stringify(dockerPkgJson, null, 2) + "\n",
  );
}

/**
 * The framework packages that must be copied into docker/node_modules/.
 * These are the @clawmasons packages needed by the proxy at runtime.
 */
const FRAMEWORK_PACKAGES = [
  "@clawmasons/chapter",
  "@clawmasons/proxy",
  "@clawmasons/shared",
  "@clawmasons/mcp-agent",
  "@clawmasons/credential-service",
];

/**
 * Resolve a package directory by walking up from startDir, like Node's module resolution.
 * Checks startDir/node_modules/<pkg>, then parent/node_modules/<pkg>, etc.
 */
function resolvePackageDir(pkgName: string, startDir: string): string | null {
  let dir = startDir;
  while (true) {
    const candidate = path.join(dir, "node_modules", ...pkgName.split("/"));
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Copy framework packages and their transitive dependencies from the project's
 * node_modules/ into docker/node_modules/, then extract chapter packages
 * from dist/*.tgz.
 */
export function populateDockerNodeModules(rootDir: string): void {
  const dockerDir = path.join(rootDir, "docker");
  const distDir = path.join(rootDir, "dist");

  // Validate dist/ has .tgz files
  if (!fs.existsSync(distDir)) {
    throw new Error(
      `No dist/ directory found. Run "clawmasons pack" first to build and pack all workspace packages.`,
    );
  }

  const tgzFiles = fs.readdirSync(distDir).filter((f) => f.endsWith(".tgz"));
  if (tgzFiles.length === 0) {
    throw new Error(
      `No .tgz files found in dist/. Run "clawmasons pack" first.`,
    );
  }

  // 1. Copy framework packages and transitive deps from node_modules/
  copyFrameworkPackages(rootDir, dockerDir);

  // 2. Extract chapter packages from dist/*.tgz into docker/node_modules/
  for (const tgzFile of tgzFiles) {
    const tgzPath = path.join(distDir, tgzFile);
    extractTgzToNodeModules(tgzPath, dockerDir);
  }
}

/**
 * Copy @clawmasons framework packages and all their transitive production
 * dependencies into docker/node_modules/.
 * Uses Node-style resolution (walks up directories) to find packages.
 * Resolves symlinks (handles monorepo workspace links).
 */
function copyFrameworkPackages(rootDir: string, dockerDir: string): void {
  const destNodeModules = path.join(dockerDir, "node_modules");
  fs.mkdirSync(destNodeModules, { recursive: true });

  // BFS to collect all packages that need copying: Map<pkgName, resolvedRealPath>
  const toCopy = new Map<string, string>();
  const queue = [...FRAMEWORK_PACKAGES];

  while (queue.length > 0) {
    const pkgName = queue.shift()!;
    if (toCopy.has(pkgName)) continue;

    const srcDir = resolvePackageDir(pkgName, rootDir)
      ?? resolvePackageDir(pkgName, CLI_DIR);
    if (!srcDir) {
      throw new Error(
        `Framework package "${pkgName}" not found in node_modules/. Run "npm install" first.`,
      );
    }

    const realSrcDir = fs.realpathSync(srcDir);
    toCopy.set(pkgName, realSrcDir);

    // Read package.json to find production dependencies
    const pkgJsonPath = path.join(realSrcDir, "package.json");
    if (fs.existsSync(pkgJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8")) as {
        dependencies?: Record<string, string>;
      };
      if (pkg.dependencies) {
        for (const dep of Object.keys(pkg.dependencies)) {
          if (!toCopy.has(dep)) {
            queue.push(dep);
          }
        }
      }
    }
  }

  // Copy each package into docker/node_modules/
  for (const [pkgName, realSrcDir] of toCopy) {
    const destDir = path.join(destNodeModules, ...pkgName.split("/"));

    if (fs.existsSync(destDir)) {
      fs.rmSync(destDir, { recursive: true, force: true });
    }
    fs.mkdirSync(path.dirname(destDir), { recursive: true });
    fs.cpSync(realSrcDir, destDir, { recursive: true, dereference: true });
  }

  // Packages copied via cpSync may contain nested node_modules/ with
  // version-conflicted dependencies (e.g. @modelcontextprotocol/sdk ships
  // its own ajv@8 while the root has ajv@6).  Those nested packages rely on
  // Node's upward resolution to find *their* transitive deps (e.g. fast-uri)
  // at the docker root level.  Walk every nested node_modules inside the
  // copied tree and ensure those transitive deps are also present.
  copyNestedDependencies(destNodeModules, rootDir);

  // Create .bin/ symlinks for all framework packages with bin entries
  const binDir = path.join(destNodeModules, ".bin");
  fs.mkdirSync(binDir, { recursive: true });

  for (const [pkgName, realSrcDir] of toCopy) {
    const pkgJsonPath = path.join(realSrcDir, "package.json");
    if (!fs.existsSync(pkgJsonPath)) continue;

    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8")) as {
      bin?: string | Record<string, string>;
    };
    if (!pkg.bin) continue;

    const binEntries: Record<string, string> =
      typeof pkg.bin === "string"
        ? { [pkgName.split("/").pop()!]: pkg.bin }
        : pkg.bin;

    for (const [binName, binPath] of Object.entries(binEntries)) {
      const linkPath = path.join(binDir, binName);
      const target = path.join("..", ...pkgName.split("/"), binPath);
      if (fs.existsSync(linkPath)) fs.unlinkSync(linkPath);
      fs.symlinkSync(target, linkPath);
      fs.chmodSync(linkPath, 0o755);
    }
  }
}

/**
 * Walk the docker node_modules tree for nested node_modules directories.
 * For each nested package, ensure its production dependencies are present
 * at the top level of destNodeModules — if missing, resolve from rootDir
 * and copy them (repeating until no new deps are discovered).
 */
function copyNestedDependencies(destNodeModules: string, rootDir: string): void {
  const copied = new Set<string>();

  // Collect top-level package names already present
  for (const name of listPackageNames(destNodeModules)) {
    copied.add(name);
  }

  let foundNew = true;
  while (foundNew) {
    foundNew = false;

    for (const nestedPkgDir of findNestedNodeModulesPackages(destNodeModules)) {
      const pkgJsonPath = path.join(nestedPkgDir, "package.json");
      if (!fs.existsSync(pkgJsonPath)) continue;

      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8")) as {
        dependencies?: Record<string, string>;
      };
      if (!pkg.dependencies) continue;

      for (const dep of Object.keys(pkg.dependencies)) {
        if (copied.has(dep)) continue;

        const srcDir = resolvePackageDir(dep, rootDir)
          ?? resolvePackageDir(dep, CLI_DIR);
        if (!srcDir) continue; // optional peer or already nested

        const realSrcDir = fs.realpathSync(srcDir);
        const destDir = path.join(destNodeModules, ...dep.split("/"));

        fs.mkdirSync(path.dirname(destDir), { recursive: true });
        fs.cpSync(realSrcDir, destDir, { recursive: true, dereference: true });

        copied.add(dep);
        foundNew = true;
      }
    }
  }
}

/**
 * List top-level package names in a node_modules directory.
 * Handles both plain packages ("commander") and scoped ("@scope/pkg").
 */
function listPackageNames(nodeModulesDir: string): string[] {
  const names: string[] = [];
  if (!fs.existsSync(nodeModulesDir)) return names;

  for (const entry of fs.readdirSync(nodeModulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === ".bin") continue;

    if (entry.name.startsWith("@")) {
      // Scoped package — list children
      const scopeDir = path.join(nodeModulesDir, entry.name);
      for (const child of fs.readdirSync(scopeDir, { withFileTypes: true })) {
        if (child.isDirectory()) {
          names.push(`${entry.name}/${child.name}`);
        }
      }
    } else {
      names.push(entry.name);
    }
  }
  return names;
}

/**
 * Recursively find all packages inside nested node_modules directories
 * within the given top-level node_modules. Returns absolute paths to
 * each nested package directory.
 */
function findNestedNodeModulesPackages(topNodeModules: string): string[] {
  const results: string[] = [];

  function walkPackage(pkgDir: string): void {
    const nestedNm = path.join(pkgDir, "node_modules");
    if (!fs.existsSync(nestedNm)) return;

    for (const entry of fs.readdirSync(nestedNm, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === ".bin") continue;

      if (entry.name.startsWith("@")) {
        const scopeDir = path.join(nestedNm, entry.name);
        for (const child of fs.readdirSync(scopeDir, { withFileTypes: true })) {
          if (child.isDirectory()) {
            const childDir = path.join(scopeDir, child.name);
            results.push(childDir);
            walkPackage(childDir);
          }
        }
      } else {
        const childDir = path.join(nestedNm, entry.name);
        results.push(childDir);
        walkPackage(childDir);
      }
    }
  }

  // Walk each top-level package
  for (const entry of fs.readdirSync(topNodeModules, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === ".bin") continue;

    if (entry.name.startsWith("@")) {
      const scopeDir = path.join(topNodeModules, entry.name);
      for (const child of fs.readdirSync(scopeDir, { withFileTypes: true })) {
        if (child.isDirectory()) {
          walkPackage(path.join(scopeDir, child.name));
        }
      }
    } else {
      walkPackage(path.join(topNodeModules, entry.name));
    }
  }

  return results;
}

/**
 * Extract a .tgz package into docker/node_modules/<scope>/<name>.
 * npm pack outputs tarballs with contents under a `package/` directory.
 */
function extractTgzToNodeModules(tgzPath: string, dockerDir: string): void {
  const tmpDir = fs.mkdtempSync(path.join(dockerDir, ".tmp-extract-"));

  try {
    // Extract the tarball
    execFileSync("tar", ["-xzf", tgzPath, "-C", tmpDir], { stdio: "pipe" });

    // Read the package name from the extracted package.json
    const extractedPkgJson = path.join(tmpDir, "package", "package.json");
    if (!fs.existsSync(extractedPkgJson)) {
      throw new Error(`No package.json found in ${path.basename(tgzPath)}`);
    }

    const pkg = JSON.parse(fs.readFileSync(extractedPkgJson, "utf-8")) as { name: string };
    const pkgName = pkg.name;

    // Determine target directory in node_modules
    const targetDir = path.join(dockerDir, "node_modules", ...pkgName.split("/"));

    // Remove existing directory if present, then move extracted contents
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
    fs.mkdirSync(path.dirname(targetDir), { recursive: true });
    fs.renameSync(path.join(tmpDir, "package"), targetDir);
  } finally {
    // Clean up temp directory
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export interface DockerInitDeps {
  /** Skip running npm install (for testing). */
  skipInstall?: boolean;
  /** Skip Dockerfile generation (for testing install-only). */
  skipDockerfiles?: boolean;
}

export function registerDockerInitCommand(program: Command): void {
  program
    .command("docker-init")
    .description("Set up Docker build system — scaffold docker/ directory and install local packages")
    .action(async () => {
      await runDockerInit(process.cwd());
    });
}

export async function runDockerInit(
  rootDir: string,
  deps?: DockerInitDeps,
): Promise<void> {
  try {
    // 1. Read chapter config
    const config = readChapterConfig(rootDir);
    const chapterName = config.chapter;
    console.log(`\n  Chapter: ${chapterName}\n`);

    // 2. Create docker/ directory with package.json (includes @clawmasons/chapter dep)
    createDockerPackageJson(rootDir, chapterName);
    console.log("  Created docker/package.json");

    // 3. Populate docker/node_modules/ with framework deps + chapter packages
    if (!deps?.skipInstall) {
      console.log("\n  Installing dependencies into docker/node_modules/...\n");
      populateDockerNodeModules(rootDir);
      console.log("\n  docker/node_modules/ populated");
    }

    // 4. Generate Dockerfiles for proxy and agent images
    if (!deps?.skipDockerfiles) {
      const dockerDir = path.join(rootDir, "docker");
      generateDockerfiles(dockerDir);
    }

    console.log("\n✔ docker-init complete\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n✘ docker-init failed: ${message}\n`);
    process.exit(1);
  }
}

// ── Dockerfile Generation ──────────────────────────────────────────────

/**
 * Get the runtime materializer for a given runtime name.
 */
function getMaterializer(runtime: string): RuntimeMaterializer | undefined {
  switch (runtime) {
    case "claude-code":
      return claudeCodeMaterializer;
    case "pi-coding-agent":
      return piCodingAgentMaterializer;
    case "mcp-agent":
      return mcpAgentMaterializer;
    default:
      return undefined;
  }
}

/**
 * Scan docker/node_modules/ for chapter packages, resolve agents,
 * and generate proxy and agent Dockerfiles.
 */
export function generateDockerfiles(dockerDir: string): void {
  // Discover all chapter packages from docker/node_modules/
  const packages = discoverPackages(dockerDir);

  if (packages.size === 0) {
    console.log("\n  No chapter packages found in docker/node_modules/ — skipping Dockerfile generation");
    return;
  }

  // Find all role packages and build ResolvedAgent wrappers for compatibility
  const agents: ResolvedAgent[] = [];
  const allRoles = new Map<string, ResolvedRole>();

  for (const [name, pkg] of packages) {
    if (pkg.chapterField.type === "role") {
      const resolved = resolveRolePackage(name, packages);
      if (!allRoles.has(resolved.name)) {
        allRoles.set(resolved.name, resolved);
      }

      // Build a ResolvedAgent wrapper for each role
      const agentShortName = getAppShortName(name);
      agents.push({
        name,
        version: resolved.version,
        agentName: agentShortName,
        slug: agentShortName,
        runtimes: ["claude-code"],
        credentials: [],
        roles: [resolved],
      });
    }
  }

  if (allRoles.size === 0) {
    console.log("\n  No role packages found — skipping Dockerfile generation");
    return;
  }

  console.log(`\n  Generating Dockerfiles for ${allRoles.size} role(s)...`);

  // Generate credential service Dockerfile — one per chapter
  {
    const dockerfile = generateCredentialServiceDockerfile();
    const dockerfilePath = path.join(dockerDir, "credential-service", "Dockerfile");

    fs.mkdirSync(path.dirname(dockerfilePath), { recursive: true });
    fs.writeFileSync(dockerfilePath, dockerfile);
    console.log("  Created credential-service/Dockerfile");
  }

  // Generate proxy Dockerfiles — one per unique role
  for (const [, role] of allRoles) {
    const roleShortName = getAppShortName(role.name);
    // Use the first agent that has this role (proxy serves any agent with the role)
    const ownerAgent = agents.find((a) =>
      a.roles.some((r) => r.name === role.name),
    );
    if (!ownerAgent) continue;

    const dockerfile = generateProxyDockerfile(role, ownerAgent.name);
    const dockerfilePath = path.join(dockerDir, "proxy", roleShortName, "Dockerfile");

    fs.mkdirSync(path.dirname(dockerfilePath), { recursive: true });
    fs.writeFileSync(dockerfilePath, dockerfile);
    console.log(`  Created proxy/${roleShortName}/Dockerfile`);
  }

  // Generate agent Dockerfiles — one per agent × role
  for (const agent of agents) {
    const agentShortName = getAppShortName(agent.name);

    for (const role of agent.roles) {
      const roleShortName = getAppShortName(role.name);

      // Generate the Dockerfile
      const dockerfile = generateAgentDockerfile(agent, role);
      const dockerfilePath = path.join(
        dockerDir, "agent", agentShortName, roleShortName, "Dockerfile",
      );

      fs.mkdirSync(path.dirname(dockerfilePath), { recursive: true });
      fs.writeFileSync(dockerfilePath, dockerfile);
      console.log(`  Created agent/${agentShortName}/${roleShortName}/Dockerfile`);

      // Materialize workspace files for the agent × role
      const materializer = getMaterializer(agent.runtimes[0] ?? "claude-code");
      if (materializer) {
        const proxyEndpoint = `http://proxy-${roleShortName}:9090`;
        // Create a single-role agent view for workspace materialization
        const singleRoleAgent: ResolvedAgent = {
          ...agent,
          roles: [role],
        };
        const workspace = materializer.materializeWorkspace(singleRoleAgent, proxyEndpoint);

        const workspaceDir = path.join(
          dockerDir, "agent", agentShortName, roleShortName, "workspace",
        );

        for (const [filePath, content] of workspace) {
          const fullPath = path.join(workspaceDir, filePath);
          fs.mkdirSync(path.dirname(fullPath), { recursive: true });
          fs.writeFileSync(fullPath, content);
        }
        console.log(`  Created agent/${agentShortName}/${roleShortName}/workspace/`);
      }
    }
  }
}
