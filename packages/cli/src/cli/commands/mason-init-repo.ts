/**
 * mason init-repo — Generate a publishable npm monorepo from a local role definition.
 *
 * Reads a local RoleType via unified role discovery, then generates a complete
 * npm workspace monorepo with separate packages for the role and each of its
 * dependencies (skills, apps, tasks).
 *
 * PRD refs: §11 (Monorepo Generation), §11.1–§11.4
 */

import type { Command } from "commander";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { join, basename, resolve as pathResolve } from "node:path";
import type { RoleType, AppConfig, SkillRef, TaskRef } from "@clawmasons/shared";
import { resolveRole } from "@clawmasons/shared";

// ── Types ──────────────────────────────────────────────────────────────

export interface InitRepoOptions {
  role: string;
  targetDir?: string;
}

/**
 * Injectable dependencies for testing.
 */
export interface InitRepoDeps {
  resolveRoleFn?: (name: string, projectDir: string) => Promise<RoleType>;
}

// ── Scope + Name Utilities ─────────────────────────────────────────────

/**
 * Convert a role scope (dot notation) to an npm scope prefix.
 * e.g., "acme.engineering" → "@acme-engineering/"
 * If no scope, returns empty string.
 */
export function scopeToNpmPrefix(scope?: string): string {
  if (!scope) return "";
  const npmScope = scope.replace(/\./g, "-");
  return `@${npmScope}/`;
}

/**
 * Derive a short name from a dependency reference.
 * - NPM package reference: extract the unscoped name
 * - Local path reference: use the basename
 */
export function deriveShortName(ref: string): string {
  if (ref.startsWith("@")) {
    // Scoped npm package: @scope/name → name
    const parts = ref.split("/");
    return parts[parts.length - 1] ?? ref;
  }
  if (ref.startsWith(".") || ref.startsWith("/")) {
    // Local path: use basename
    return basename(ref);
  }
  // Plain name
  return ref;
}

/**
 * Derive a package name for a dependency.
 * If the ref is already an npm package name, use it as-is.
 * Otherwise, construct one from the scope and type prefix.
 */
export function derivePackageName(
  ref: string,
  typePrefix: string,
  npmPrefix: string,
): string {
  if (ref.startsWith("@") || (!ref.startsWith(".") && !ref.startsWith("/"))) {
    // Already looks like an npm package reference — but if it doesn't contain /
    // and has no @, it's a local name we should prefix
    if (ref.startsWith("@")) return ref;
  }
  const shortName = deriveShortName(ref);
  return `${npmPrefix}${typePrefix}-${shortName}`;
}

// ── Package.json Generators ────────────────────────────────────────────

export function generateRootPackageJson(
  roleName: string,
  workspaceDirs: string[],
): Record<string, unknown> {
  return {
    name: `${roleName}-monorepo`,
    version: "1.0.0",
    private: true,
    workspaces: workspaceDirs,
  };
}

export function generateRolePackageJson(
  role: RoleType,
  npmPrefix: string,
  dependencyPackageNames: Record<string, string>,
): Record<string, unknown> {
  const name = `${npmPrefix}role-${role.metadata.name}`;
  const version = role.metadata.version ?? "1.0.0";

  const pkg: Record<string, unknown> = {
    name,
    version,
    description: role.metadata.description,
    chapter: {
      type: "role",
    },
    files: ["ROLE.md"],
  };

  // Add dependencies if any
  if (Object.keys(dependencyPackageNames).length > 0) {
    pkg.dependencies = dependencyPackageNames;
  }

  return pkg;
}

export function generateSkillPackageJson(
  skill: SkillRef,
  npmPrefix: string,
): Record<string, unknown> {
  const shortName = deriveShortName(skill.ref ?? skill.name);
  return {
    name: `${npmPrefix}skill-${shortName}`,
    version: "1.0.0",
    description: `Skill: ${skill.name}`,
    chapter: {
      type: "skill",
    },
  };
}

export function generateAppPackageJson(
  app: AppConfig,
  npmPrefix: string,
): Record<string, unknown> {
  return {
    name: `${npmPrefix}app-${app.name}`,
    version: "1.0.0",
    description: `App: ${app.name}`,
    chapter: {
      type: "app",
    },
  };
}

export function generateTaskPackageJson(
  task: TaskRef,
  npmPrefix: string,
): Record<string, unknown> {
  const shortName = deriveShortName(task.ref ?? task.name);
  return {
    name: `${npmPrefix}task-${shortName}`,
    version: "1.0.0",
    description: `Task: ${task.name}`,
    chapter: {
      type: "task",
    },
  };
}

// ── Monorepo Generator ─────────────────────────────────────────────────

/**
 * Generate a complete npm workspace monorepo from a local role definition.
 *
 * @param role - The resolved RoleType to generate from
 * @param targetDir - Absolute path to the target directory
 */
export async function generateMonorepo(
  role: RoleType,
  targetDir: string,
): Promise<void> {
  const npmPrefix = scopeToNpmPrefix(role.metadata.scope);
  const roleName = role.metadata.name;

  // Track workspace directories
  const workspaceDirs: string[] = ["roles/*"];

  // Track dependency package names for the role's package.json
  const dependencyPackageNames: Record<string, string> = {};

  // 1. Create target directory
  await mkdir(targetDir, { recursive: true });

  // 2. Generate role package
  const roleDir = join(targetDir, "roles", roleName);
  await mkdir(roleDir, { recursive: true });

  // Copy ROLE.md from source
  if (role.source.path) {
    const sourceRoleMd = join(role.source.path, "ROLE.md");
    try {
      await copyFile(sourceRoleMd, join(roleDir, "ROLE.md"));
    } catch {
      // If copy fails, try reading from the path directly
      // (source.path might be the ROLE.md file itself, not a directory)
      const parentDir = role.source.path;
      const roleMdPath = join(parentDir, "ROLE.md");
      try {
        await copyFile(roleMdPath, join(roleDir, "ROLE.md"));
      } catch {
        // Create a minimal ROLE.md if source not accessible
        const minimalRoleMd = `---\nname: ${roleName}\ndescription: ${role.metadata.description}\n---\n\n${role.instructions}\n`;
        await writeFile(join(roleDir, "ROLE.md"), minimalRoleMd);
      }
    }
  } else {
    // No source path — generate a minimal ROLE.md
    const minimalRoleMd = `---\nname: ${roleName}\ndescription: ${role.metadata.description}\n---\n\n${role.instructions}\n`;
    await writeFile(join(roleDir, "ROLE.md"), minimalRoleMd);
  }

  // Copy bundled resources
  for (const resource of role.resources ?? []) {
    const destPath = join(roleDir, resource.relativePath);
    const destDir = join(destPath, "..");
    await mkdir(destDir, { recursive: true });
    try {
      await copyFile(resource.absolutePath, destPath);
    } catch {
      // Resource not accessible — skip
    }
  }

  // 3. Generate skill packages
  const skills = role.skills ?? [];
  if (skills.length > 0) {
    workspaceDirs.push("skills/*");
    for (const skill of skills) {
      const shortName = deriveShortName(skill.ref ?? skill.name);
      const skillDir = join(targetDir, "skills", shortName);
      await mkdir(skillDir, { recursive: true });

      const skillPkg = generateSkillPackageJson(skill, npmPrefix);
      await writeFile(
        join(skillDir, "package.json"),
        JSON.stringify(skillPkg, null, 2) + "\n",
      );

      // Create a placeholder SKILL.md
      await writeFile(
        join(skillDir, "SKILL.md"),
        `# ${skill.name}\n\nSkill definition placeholder.\n`,
      );

      dependencyPackageNames[skillPkg.name as string] = "1.0.0";
    }
  }

  // 4. Generate app packages
  const apps = role.apps ?? [];
  if (apps.length > 0) {
    workspaceDirs.push("apps/*");
    for (const app of apps) {
      const appDir = join(targetDir, "apps", app.name);
      await mkdir(appDir, { recursive: true });

      const appPkg = generateAppPackageJson(app, npmPrefix);
      await writeFile(
        join(appDir, "package.json"),
        JSON.stringify(appPkg, null, 2) + "\n",
      );

      dependencyPackageNames[appPkg.name as string] = "1.0.0";
    }
  }

  // 5. Generate task packages
  const tasks = role.tasks ?? [];
  if (tasks.length > 0) {
    workspaceDirs.push("tasks/*");
    for (const task of tasks) {
      const shortName = deriveShortName(task.ref ?? task.name);
      const taskDir = join(targetDir, "tasks", shortName);
      await mkdir(taskDir, { recursive: true });

      const taskPkg = generateTaskPackageJson(task, npmPrefix);
      await writeFile(
        join(taskDir, "package.json"),
        JSON.stringify(taskPkg, null, 2) + "\n",
      );

      // Create a placeholder PROMPT.md
      await writeFile(
        join(taskDir, "PROMPT.md"),
        `# ${task.name}\n\nTask prompt placeholder.\n`,
      );

      dependencyPackageNames[taskPkg.name as string] = "1.0.0";
    }
  }

  // 6. Generate role package.json (after collecting dependencies)
  const rolePkg = generateRolePackageJson(role, npmPrefix, dependencyPackageNames);
  await writeFile(
    join(roleDir, "package.json"),
    JSON.stringify(rolePkg, null, 2) + "\n",
  );

  // 7. Generate root package.json
  const rootPkg = generateRootPackageJson(roleName, workspaceDirs);
  await writeFile(
    join(targetDir, "package.json"),
    JSON.stringify(rootPkg, null, 2) + "\n",
  );
}

// ── CLI Command ────────────────────────────────────────────────────────

export function registerMasonInitRepoCommand(program: Command): void {
  program
    .command("init-repo")
    .description(
      "Generate a publishable npm monorepo from a local role definition",
    )
    .requiredOption("--role <name>", "Role to generate monorepo from")
    .option(
      "--target-dir <path>",
      "Override the default output directory",
    )
    .action(
      async (options: { role: string; targetDir?: string }) => {
        await initRepo(process.cwd(), {
          role: options.role,
          targetDir: options.targetDir,
        });
      },
    );
}

/**
 * Main orchestrator for `mason init-repo`.
 */
export async function initRepo(
  projectDir: string,
  options: InitRepoOptions,
  deps?: InitRepoDeps,
): Promise<void> {
  const resolveRoleFn = deps?.resolveRoleFn ?? resolveRole;

  try {
    // 1. Resolve the role
    console.log(`\n  Resolving role "${options.role}"...`);
    const role = await resolveRoleFn(options.role, projectDir);

    // 2. Validate that the role is local (not a package)
    if (role.source.type === "package") {
      throw new Error(
        `Role "${options.role}" is an installed package. ` +
          `mason init-repo can only generate monorepos from local roles. ` +
          `To generate from a packaged role, first eject it to a local ROLE.md.`,
      );
    }

    // 3. Determine target directory
    const targetDir = options.targetDir
      ? pathResolve(options.targetDir)
      : join(projectDir, ".mason", "repositories", role.metadata.name);

    console.log(`  Target directory: ${targetDir}`);

    // 4. Generate the monorepo
    await generateMonorepo(role, targetDir);

    // 5. Report results
    const skills = role.skills ?? [];
    const apps = role.apps ?? [];
    const tasks = role.tasks ?? [];
    const totalPackages = 1 + skills.length + apps.length + tasks.length;

    console.log(`  Generated monorepo with ${totalPackages} package(s):`);
    console.log(`    - 1 role: ${role.metadata.name}`);
    if (skills.length > 0) console.log(`    - ${skills.length} skill(s)`);
    if (apps.length > 0) console.log(`    - ${apps.length} app(s)`);
    if (tasks.length > 0) console.log(`    - ${tasks.length} task(s)`);
    console.log(`\n  To publish: cd ${targetDir} && npm publish --workspaces`);
    console.log(`  To pack:    cd ${targetDir} && npm pack --workspaces\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n  init-repo failed: ${message}\n`);
    process.exit(1);
  }
}
