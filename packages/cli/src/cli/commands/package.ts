/**
 * mason package — Build and pack a role from .mason/roles/<name>/ into a
 * distributable npm .tgz package.
 *
 * Steps:
 * 1. Load ROLE.md from .mason/roles/<name>/ROLE.md
 * 2. Validate all task/skill refs can be resolved from role.sources
 * 3. Assemble build directory at .mason/roles/<name>/build/
 * 4. Generate/merge package.json in build dir
 * 5. Run npm install, npm run build (if script exists), npm pack
 */

import type { Command } from "commander";
import {
  mkdir,
  writeFile,
  readFile,
  copyFile,
  cp,
  stat,
  readdir,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve as pathResolve, basename, extname } from "node:path";
import { spawnSync } from "node:child_process";
import { resolveRole, RoleDiscoveryError } from "@clawmasons/shared";
import { getDialectByDirectory } from "@clawmasons/shared";
import type { Role, TaskRef, SkillRef } from "@clawmasons/shared";

// ---------------------------------------------------------------------------
// CLI registration
// ---------------------------------------------------------------------------

export function registerPackageCommand(program: Command): void {
  program
    .command("package")
    .description("Build and pack a role from .mason/roles/<name>/ into an npm package")
    .requiredOption("--role <name>", "Role name to package")
    .action(async (options: { role: string }) => {
      await runPackage(process.cwd(), options.role);
    });
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

export async function runPackage(
  projectDir: string,
  roleName: string,
): Promise<void> {
  try {
    // 1. Load role from .mason/roles/<name>/ROLE.md
    console.log(`\n  Loading role "${roleName}"...`);
    let role: Role;
    try {
      role = await resolveRole(roleName, projectDir);
    } catch (err) {
      if (err instanceof RoleDiscoveryError) {
        const expectedPath = join(
          projectDir,
          ".mason",
          "roles",
          roleName,
          "ROLE.md",
        );
        throw new Error(
          `Role "${roleName}" not found. Expected ROLE.md at: ${expectedPath}`,
        );
      }
      throw err;
    }

    if (role.source.type !== "local") {
      throw new Error(
        `Role "${roleName}" is an installed package, not a local role. ` +
          `mason package only works with local roles in .mason/roles/.`,
      );
    }

    // 2. Resolve all task/skill refs from sources
    console.log("  Resolving sources...");
    const { resolvedTasks, resolvedSkills, errors } = await resolveAllRefs(
      role,
      projectDir,
    );

    if (errors.length > 0) {
      console.error("\n  Unresolved references:");
      for (const e of errors) {
        console.error(`    ✘ ${e}`);
      }
      throw new Error(
        `${errors.length} reference(s) could not be resolved. Fix them before packaging.`,
      );
    }

    // 3. Assemble build directory
    const buildDir = join(projectDir, ".mason", "roles", roleName, "build");
    console.log(`  Assembling build directory: ${buildDir}`);
    await assembleBuild(role, buildDir, resolvedTasks, resolvedSkills);

    // 4. Generate/merge package.json
    await writePackageJson(role, roleName, projectDir, buildDir);

    // 5. npm lifecycle
    console.log("  Running npm install...");
    runNpm(["install"], buildDir);

    const pkg = JSON.parse(
      await readFile(join(buildDir, "package.json"), "utf-8"),
    ) as { scripts?: Record<string, string> };
    if (pkg.scripts?.build) {
      console.log("  Running npm run build...");
      runNpm(["run", "build"], buildDir);
    }

    console.log("  Running npm pack...");
    runNpm(["pack"], buildDir);

    // Report result
    const tgzFiles = (await readdir(buildDir)).filter((f) =>
      f.endsWith(".tgz"),
    );
    if (tgzFiles.length > 0) {
      console.log(`\n✔ Packed: ${join(buildDir, tgzFiles[0] ?? "")}\n`);
    } else {
      console.log(`\n✔ Package created in ${buildDir}\n`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n✘ Package failed: ${message}\n`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Ref resolution
// ---------------------------------------------------------------------------

interface ResolvedFile {
  /** Original task/skill name */
  name: string;
  /** Absolute path to the source file or directory */
  sourcePath: string;
  /** Relative destination path inside the build dir (e.g., tasks/take-notes.md) */
  destRelPath: string;
}

interface ResolutionResult {
  resolvedTasks: ResolvedFile[];
  resolvedSkills: ResolvedFile[];
  errors: string[];
}

async function resolveAllRefs(
  role: Role,
  projectDir: string,
): Promise<ResolutionResult> {
  const resolvedTasks: ResolvedFile[] = [];
  const resolvedSkills: ResolvedFile[] = [];
  const errors: string[] = [];

  const sources = role.sources ?? [];

  for (const task of role.tasks ?? []) {
    const resolved = await resolveRef(task, "task", sources, projectDir);
    if (resolved) {
      resolvedTasks.push(resolved);
    } else {
      errors.push(`task "${task.name}" not found in sources: ${sources.join(", ") || "(none)"}`);
    }
  }

  for (const skill of role.skills ?? []) {
    const resolved = await resolveRef(skill, "skill", sources, projectDir);
    if (resolved) {
      resolvedSkills.push(resolved);
    } else {
      errors.push(`skill "${skill.name}" not found in sources: ${sources.join(", ") || "(none)"}`);
    }
  }

  return { resolvedTasks, resolvedSkills, errors };
}

async function resolveRef(
  ref: TaskRef | SkillRef,
  type: "task" | "skill",
  sources: string[],
  projectDir: string,
): Promise<ResolvedFile | undefined> {
  const name = ref.name;

  // If ref has an explicit absolute path, use it directly
  if (ref.ref && (ref.ref.startsWith("/") || existsSync(ref.ref))) {
    const srcPath = pathResolve(projectDir, ref.ref);
    const dest = type === "task"
      ? `tasks/${basename(srcPath)}`
      : `skills/${basename(srcPath)}`;
    return { name, sourcePath: srcPath, destRelPath: dest };
  }

  // Otherwise scan sources directories
  for (const sourceEntry of sources) {
    const sourceDir = join(projectDir, sourceEntry.replace(/\/$/, ""));

    // Determine which subdirectory to search based on dialect (if any)
    const dirName = basename(sourceDir); // e.g., ".claude" → but sourceEntry is ".claude/"
    const rawDirName = sourceEntry.replace(/^\./, "").replace(/\/$/, ""); // "claude"
    const dialect = getDialectByDirectory(rawDirName);

    let searchSubdir: string;
    if (type === "task") {
      // Use dialect-specific task subdir, or "tasks" as generic fallback
      searchSubdir = dialect ? dialect.fieldMapping.tasks : "tasks";
    } else {
      // Skills are always in "skills/" subdirectory
      searchSubdir = "skills";
    }

    const searchDir = join(sourceDir, searchSubdir);
    const found = await findFileOrDir(searchDir, name);
    if (found) {
      const ext = extname(found);
      const destName = ext ? `${name}${ext}` : name;
      const dest = type === "task" ? `tasks/${destName}` : `skills/${destName}`;
      return { name, sourcePath: found, destRelPath: dest };
    }
  }

  return undefined;
}

/**
 * Find a file or directory matching <name> (with or without extension) in dir.
 * Returns the absolute path if found, undefined otherwise.
 */
async function findFileOrDir(
  dir: string,
  name: string,
): Promise<string | undefined> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return undefined;
  }

  // Exact match (directory or extensionless file)
  if (entries.includes(name)) {
    return join(dir, name);
  }

  // Match with any extension (e.g., name.md)
  const withExt = entries.find((e) => e.startsWith(name + "."));
  if (withExt) {
    return join(dir, withExt);
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Build directory assembly
// ---------------------------------------------------------------------------

async function assembleBuild(
  role: Role,
  buildDir: string,
  resolvedTasks: ResolvedFile[],
  resolvedSkills: ResolvedFile[],
): Promise<void> {
  await mkdir(buildDir, { recursive: true });

  // Copy ROLE.md
  if (role.source.path) {
    const srcRoleMd = join(role.source.path, "ROLE.md");
    await copyFile(srcRoleMd, join(buildDir, "ROLE.md"));
  }

  // Copy task files
  for (const t of resolvedTasks) {
    const destPath = join(buildDir, t.destRelPath);
    await mkdir(join(destPath, ".."), { recursive: true });
    await copyPath(t.sourcePath, destPath);
  }

  // Copy skill files
  for (const s of resolvedSkills) {
    const destPath = join(buildDir, s.destRelPath);
    await mkdir(join(destPath, ".."), { recursive: true });
    await copyPath(s.sourcePath, destPath);
  }
}

async function copyPath(src: string, dest: string): Promise<void> {
  const s = await stat(src);
  if (s.isDirectory()) {
    await cp(src, dest, { recursive: true });
  } else {
    await copyFile(src, dest);
  }
}

// ---------------------------------------------------------------------------
// package.json generation / merge
// ---------------------------------------------------------------------------

async function writePackageJson(
  role: Role,
  roleName: string,
  projectDir: string,
  buildDir: string,
): Promise<void> {
  const userPkgPath = join(projectDir, ".mason", "roles", roleName, "package.json");

  let base: Record<string, unknown> = {
    name: role.metadata.scope
      ? `@${role.metadata.scope.replace(/\./g, "-")}/${roleName}`
      : roleName,
    version: role.metadata.version ?? "1.0.0",
    description: role.metadata.description,
  };

  // Merge user-supplied package.json if it exists
  if (existsSync(userPkgPath)) {
    const userPkg = JSON.parse(
      await readFile(userPkgPath, "utf-8"),
    ) as Record<string, unknown>;
    base = { ...base, ...userPkg };
  }

  // Generated fields always win
  base.chapter = { type: "role" };
  base.files = ["ROLE.md", "tasks/", "skills/"];

  await writeFile(
    join(buildDir, "package.json"),
    JSON.stringify(base, null, 2) + "\n",
  );
}

// ---------------------------------------------------------------------------
// npm helpers
// ---------------------------------------------------------------------------

function runNpm(args: string[], cwd: string): void {
  const result = spawnSync("npm", args, { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(
      `npm ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`,
    );
  }
}
