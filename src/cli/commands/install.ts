import type { Command } from "commander";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverPackages } from "../../resolver/discover.js";
import { resolveMember } from "../../resolver/resolve.js";
import { validateMember } from "../../validator/validate.js";
import { generateProxyDockerfile } from "../../generator/proxy-dockerfile.js";
import { claudeCodeMaterializer } from "../../materializer/claude-code.js";
import type { RuntimeMaterializer, ComposeServiceDef } from "../../materializer/types.js";
import type { ResolvedMember, ResolvedTask } from "../../resolver/types.js";
import { generateDockerCompose } from "../../compose/docker-compose.js";
import { generateEnvTemplate } from "../../compose/env.js";
import { generateLockFile } from "../../compose/lock.js";
import { addMember } from "../../registry/members.js";

interface InstallOptions {
  outputDir?: string;
}

/** Registry of runtime name → materializer. */
const materializerRegistry = new Map<string, RuntimeMaterializer>([
  ["claude-code", claudeCodeMaterializer],
]);

/** Workspace directories that contain member packages. */
const WORKSPACE_DIRS = ["apps", "tasks", "skills", "roles", "members"];

/** Collect all package names from the resolved member dependency graph. */
function collectResolvedNames(member: ResolvedMember): Set<string> {
  const names = new Set<string>();
  names.add(member.name);
  for (const role of member.roles) {
    names.add(role.name);
    for (const app of role.apps) names.add(app.name);
    for (const skill of role.skills) names.add(skill.name);
    for (const task of role.tasks) addTaskNames(task, names);
  }
  return names;
}

function addTaskNames(task: ResolvedTask, names: Set<string>): void {
  names.add(task.name);
  for (const app of task.apps) names.add(app.name);
  for (const skill of task.skills) names.add(skill.name);
  for (const sub of task.subTasks) addTaskNames(sub, names);
}

/**
 * Resolve the chapter project root directory (where package.json, dist/, bin/ live).
 * Uses import.meta.url to locate the chapter installation.
 */
function getChapterProjectRoot(): string {
  // This file is at src/cli/commands/install.ts (or dist/cli/commands/install.js)
  // The project root is 3 levels up from the file's directory.
  const thisFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(thisFile), "..", "..", "..");
}

/**
 * Copy a directory tree into the allFiles map with a given prefix.
 * Only copies files (not directories), recursively.
 *
 * @param skipDirs - Directory names to skip (defaults to ["node_modules", ".git"])
 */
function copyDirToFiles(
  srcDir: string,
  prefix: string,
  allFiles: Map<string, string>,
  skipDirs: string[] = ["node_modules", ".git"],
): void {
  if (!fs.existsSync(srcDir)) return;

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = `${prefix}/${entry.name}`;

    if (entry.isDirectory()) {
      if (skipDirs.includes(entry.name)) continue;
      copyDirToFiles(srcPath, destPath, allFiles, skipDirs);
    } else {
      allFiles.set(destPath, fs.readFileSync(srcPath, "utf-8"));
    }
  }
}

export function registerInstallCommand(program: Command): void {
  program
    .command("install")
    .description("Install and scaffold a member deployment directory")
    .argument("<member>", "Member package name to install")
    .option("--output-dir <dir>", "Custom output directory for scaffolded files")
    .action(async (memberName: string, options: InstallOptions) => {
      await runInstall(process.cwd(), memberName, options);
    });
}

export async function runInstall(
  rootDir: string,
  memberName: string,
  options: InstallOptions,
): Promise<void> {
  try {
    // 1. Discover packages
    console.log("Discovering packages...");
    const packages = discoverPackages(rootDir);

    // 2. Resolve member graph
    console.log("Resolving member dependency graph...");
    const member = resolveMember(memberName, packages);

    // 3. Validate
    console.log("Validating member graph...");
    const validation = validateMember(member);
    if (!validation.valid) {
      const errorLines = validation.errors.map((e) => `  - [${e.category}] ${e.message}`);
      console.error(
        `\n✘ Member "${memberName}" failed validation with ${validation.errors.length} error(s):\n${errorLines.join("\n")}\n`,
      );
      process.exit(1);
      return;
    }
    if (validation.warnings.length > 0) {
      for (const w of validation.warnings) {
        console.warn(`  ⚠ [${w.category}] ${w.message}`);
      }
    }

    // 3b. Determine output directory using member slug
    const outputDir = options.outputDir
      ? path.resolve(rootDir, options.outputDir)
      : path.join(rootDir, ".chapter", "members", member.slug);

    // 3c. Handle human member install (log/ directory only, no docker artifacts)
    if (member.memberType === "human") {
      fs.mkdirSync(path.join(outputDir, "log"), { recursive: true });

      // Update members registry
      const chapterDir = path.join(rootDir, ".chapter");
      addMember(chapterDir, member.slug, {
        package: member.name,
        memberType: member.memberType,
        status: "enabled",
        installedAt: new Date().toISOString(),
      });

      console.log(`\n✔ Member "${memberName}" installed successfully!\n`);
      console.log(`  Output: ${outputDir}`);
      console.log(`  Type: human`);
      console.log(`  Directories: log/`);
      return;
    }

    // 4. Generate proxy Dockerfile
    console.log("Generating chapter proxy Dockerfile...");
    const proxyDockerfile = generateProxyDockerfile(memberName);

    // 5. Generate proxy auth token (before materialization so it can be baked in)
    const proxyToken = crypto.randomBytes(32).toString("hex");

    // 6. Materialize runtimes
    const proxyPort = member.proxy?.port ?? 9090;
    const proxyEndpoint = `http://mcp-proxy:${proxyPort}`;
    const runtimeServices = new Map<string, ComposeServiceDef>();
    const allFiles = new Map<string, string>();
    const skippedRuntimes: string[] = [];

    for (const runtime of member.runtimes) {
      const materializer = materializerRegistry.get(runtime);
      if (!materializer) {
        skippedRuntimes.push(runtime);
        console.log(`⚠ No materializer registered for runtime "${runtime}" — skipping.`);
        continue;
      }

      console.log(`Materializing ${runtime} workspace...`);

      // Workspace files (pass token so it gets baked into settings)
      const workspace = materializer.materializeWorkspace(member, proxyEndpoint, proxyToken);
      for (const [relPath, content] of workspace) {
        allFiles.set(`${runtime}/workspace/${relPath}`, content);
      }

      // Dockerfile
      const dockerfile = materializer.generateDockerfile(member);
      allFiles.set(`${runtime}/Dockerfile`, dockerfile);

      // Config JSON (e.g., .claude.json for OOBE bypass)
      if (materializer.generateConfigJson) {
        allFiles.set(`${runtime}/.claude.json`, materializer.generateConfigJson());
      }

      // Compose service
      const service = materializer.generateComposeService(member);
      runtimeServices.set(runtime, service);
    }

    // 7. Generate proxy build context
    allFiles.set("proxy/Dockerfile", proxyDockerfile);

    // Copy pre-built chapter package into proxy/chapter/ for Docker build.
    // Only dist/, bin/, and package.json are needed.
    // Production dependencies are installed via npm install in the Dockerfile.
    const chapterRoot = getChapterProjectRoot();
    copyDirToFiles(path.join(chapterRoot, "dist"), "proxy/chapter/dist", allFiles, [".git"]);
    copyDirToFiles(path.join(chapterRoot, "bin"), "proxy/chapter/bin", allFiles, [".git"]);

    // Copy package.json for dependency installation in Docker
    const pkgJsonPath = path.join(chapterRoot, "package.json");
    if (fs.existsSync(pkgJsonPath)) {
      allFiles.set("proxy/chapter/package.json", fs.readFileSync(pkgJsonPath, "utf-8"));
    }

    // Copy member workspace directories into proxy/workspace/
    for (const wsDir of WORKSPACE_DIRS) {
      const wsDirPath = path.join(rootDir, wsDir);
      copyDirToFiles(wsDirPath, `proxy/workspace/${wsDir}`, allFiles);
    }

    // Also copy packages discovered from outside the local workspace (e.g., node_modules/chapter-core)
    // Only copy packages that are in the resolved member's dependency graph to avoid
    // basename collisions (e.g., @clawmasons/member-note-taker overwriting @vis/member-note-taker).
    const resolvedNames = collectResolvedNames(member);
    for (const [, pkg] of packages) {
      if (!resolvedNames.has(pkg.name)) continue;
      const isLocal = WORKSPACE_DIRS.some((wsDir) =>
        pkg.packagePath.startsWith(path.join(rootDir, wsDir) + path.sep),
      );
      if (!isLocal) {
        const typeDir = `${pkg.chapterField.type}s`;
        const dirName = path.basename(pkg.packagePath);
        copyDirToFiles(pkg.packagePath, `proxy/workspace/${typeDir}/${dirName}`, allFiles);
      }
    }

    // 8. Generate docker-compose.yml
    console.log("Generating docker-compose.yml...");
    const composeYaml = generateDockerCompose(member, runtimeServices);
    allFiles.set("docker-compose.yml", composeYaml);

    // 9. Generate .env with proxy token
    const envTemplate = generateEnvTemplate(member);
    const envContent = envTemplate.replace("CHAPTER_PROXY_TOKEN=", `CHAPTER_PROXY_TOKEN=${proxyToken}`);
    allFiles.set(".env", envContent);

    // 10. Generate lock file
    const lockFile = generateLockFile(member, [...allFiles.keys()]);
    allFiles.set("chapter.lock.json", JSON.stringify(lockFile, null, 2));

    // 11. Write files to output directory
    console.log(`Writing files to ${outputDir}...`);

    for (const [relPath, content] of allFiles) {
      const fullPath = path.join(outputDir, relPath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);
    }

    // Create empty .claude/ directories for runtimes that generate config JSON
    for (const runtime of member.runtimes) {
      const materializer = materializerRegistry.get(runtime);
      if (materializer?.generateConfigJson) {
        fs.mkdirSync(path.join(outputDir, runtime, ".claude"), { recursive: true });
      }
    }

    // Create log/ directory for activity tracking
    fs.mkdirSync(path.join(outputDir, "log"), { recursive: true });

    // Update members registry
    const chapterDir = path.join(rootDir, ".chapter");
    addMember(chapterDir, member.slug, {
      package: member.name,
      memberType: member.memberType,
      status: "enabled",
      installedAt: new Date().toISOString(),
    });

    // Success summary
    const materializedRuntimes = member.runtimes.filter((r) => materializerRegistry.has(r));
    console.log(`\n✔ Member "${memberName}" installed successfully!\n`);
    console.log(`  Output: ${outputDir}`);
    console.log(`  Files:  ${allFiles.size} generated`);
    console.log(`  Runtimes: ${materializedRuntimes.join(", ")}`);
    if (skippedRuntimes.length > 0) {
      console.log(`  Skipped: ${skippedRuntimes.join(", ")} (no materializer)`);
    }
    const composePath = path.join(outputDir, "docker-compose.yml");
    const runtimeName = materializedRuntimes[0] ?? "claude-code";
    console.log(`\n  Next steps:`);
    console.log(`    1. Fill in app credentials in ${path.join(outputDir, ".env")}`);
    console.log(`    2. Run: chapter run ${memberName}`);
    console.log(`       Or manually:`);
    console.log(`         docker compose -f ${composePath} up -d mcp-proxy`);
    console.log(`         docker compose -f ${composePath} run --rm ${runtimeName}`);
    console.log(`    3. On first run, authenticate with: /login\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n✘ Install failed: ${message}\n`);
    process.exit(1);
  }
}
