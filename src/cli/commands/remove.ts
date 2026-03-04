import type { Command } from "commander";
import { execFileSync } from "node:child_process";
import { discoverPackages } from "../../resolver/discover.js";
import type { DiscoveredPackage } from "../../resolver/types.js";

interface RemoveOptions {
  force: boolean;
  npmArgs: string[];
}

export function registerRemoveCommand(program: Command): void {
  program
    .command("remove")
    .description("Remove a pam package dependency (wraps npm uninstall with dependent checking)")
    .argument("<pkg>", "Package name to remove")
    .argument("[npmArgs...]", "Additional arguments forwarded to npm uninstall")
    .option("--force", "Remove even if other packages depend on it", false)
    .action(async (pkg: string, npmArgs: string[], options: { force: boolean }) => {
      await runRemove(process.cwd(), pkg, { force: options.force, npmArgs });
    });
}

/**
 * Find all pam packages in the workspace that reference the target package
 * in their pam field (permissions, tasks, skills, requires, roles).
 */
export function findDependents(
  targetPkg: string,
  packages: Map<string, DiscoveredPackage>,
): DiscoveredPackage[] {
  const dependents: DiscoveredPackage[] = [];

  for (const [name, pkg] of packages) {
    if (name === targetPkg) continue;

    const pam = pkg.pamField;
    let isDependent = false;

    if (pam.type === "role") {
      // Check permissions keys (app references)
      if (pam.permissions && targetPkg in pam.permissions) {
        isDependent = true;
      }
      // Check tasks array
      if (pam.tasks?.includes(targetPkg)) {
        isDependent = true;
      }
      // Check skills array
      if (pam.skills?.includes(targetPkg)) {
        isDependent = true;
      }
    }

    if (pam.type === "task") {
      // Check requires.apps
      if (pam.requires?.apps?.includes(targetPkg)) {
        isDependent = true;
      }
      // Check requires.skills
      if (pam.requires?.skills?.includes(targetPkg)) {
        isDependent = true;
      }
    }

    if (pam.type === "agent") {
      // Check roles array
      if (pam.roles.includes(targetPkg)) {
        isDependent = true;
      }
    }

    if (isDependent) {
      dependents.push(pkg);
    }
  }

  return dependents;
}

export async function runRemove(
  rootDir: string,
  pkg: string,
  options: RemoveOptions,
): Promise<void> {
  try {
    // 1. Check for dependents
    const packages = discoverPackages(rootDir);
    const dependents = findDependents(pkg, packages);

    if (dependents.length > 0) {
      const depList = dependents.map((d) => `  - ${d.name} (${d.pamField.type})`).join("\n");

      if (!options.force) {
        console.error(
          `\n✘ Cannot remove ${pkg}: the following packages depend on it:\n${depList}\n\nUse --force to remove anyway.\n`,
        );
        process.exit(1);
        return;
      }

      console.log(`⚠ Warning: removing ${pkg} despite dependents:\n${depList}\n`);
    }

    // 2. Run npm uninstall
    console.log(`Removing ${pkg}...`);
    const npmUninstallArgs = ["uninstall", pkg, ...options.npmArgs];
    try {
      execFileSync("npm", npmUninstallArgs, {
        cwd: rootDir,
        stdio: "inherit",
      });
    } catch {
      console.error(`\n✘ Remove failed: npm uninstall exited with an error\n`);
      process.exit(1);
      return;
    }

    console.log(`\n✔ Removed ${pkg}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n✘ Remove failed: ${message}\n`);
    process.exit(1);
  }
}
