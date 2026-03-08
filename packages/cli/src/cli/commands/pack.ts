import type { Command } from "commander";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Discover workspace package names by reading each packages sub-directory.
 */
function discoverWorkspacePackages(rootDir: string): string[] {
  const packagesDir = path.join(rootDir, "packages");
  if (!fs.existsSync(packagesDir)) {
    return [];
  }

  const entries = fs.readdirSync(packagesDir, { withFileTypes: true });
  const names: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pkgJsonPath = path.join(packagesDir, entry.name, "package.json");
    if (!fs.existsSync(pkgJsonPath)) continue;

    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8")) as { name?: string };
    if (pkg.name) {
      names.push(pkg.name);
    }
  }

  return names;
}

/**
 * Clean all .tgz files from the dist/ directory.
 * Creates dist/ if it does not exist.
 */
function cleanDist(rootDir: string): void {
  const distDir = path.join(rootDir, "dist");
  fs.mkdirSync(distDir, { recursive: true });

  const tgzFiles = fs.readdirSync(distDir).filter((f) => f.endsWith(".tgz"));
  for (const file of tgzFiles) {
    fs.unlinkSync(path.join(distDir, file));
  }
}

export function registerPackCommand(program: Command): void {
  program
    .command("pack")
    .description("Build and pack all workspace packages into dist/")
    .action(async () => {
      await runPack(process.cwd());
    });
}

export async function runPack(rootDir: string): Promise<void> {
  try {
    const pkgJsonPath = path.join(rootDir, "package.json");
    if (!fs.existsSync(pkgJsonPath)) {
      throw new Error("No package.json found at project root.");
    }

    // 1. Discover workspace packages
    const packages = discoverWorkspacePackages(rootDir);
    if (packages.length === 0) {
      throw new Error("No workspace packages found in packages/.");
    }

    console.log(`\n  Found ${packages.length} workspace package(s):`);
    for (const name of packages) {
      console.log(`    - ${name}`);
    }

    // 2. Clean dist/
    console.log("\n  Cleaning dist/*.tgz...");
    cleanDist(rootDir);

    // 3. Build
    console.log("  Building...\n");
    try {
      execFileSync("npm", ["run", "build"], {
        cwd: rootDir,
        stdio: "inherit",
      });
    } catch {
      throw new Error("Build failed. Fix build errors before packing.");
    }

    // 4. Pack each workspace package
    const distDir = path.join(rootDir, "dist");
    console.log("");
    for (const name of packages) {
      console.log(`  Packing ${name}...`);
      try {
        execFileSync("npm", ["pack", "--workspace", name, "--pack-destination", distDir], {
          cwd: rootDir,
          stdio: "pipe",
        });
      } catch {
        throw new Error(`Failed to pack ${name}.`);
      }
    }

    // 5. Summary
    const tgzFiles = fs.readdirSync(distDir).filter((f) => f.endsWith(".tgz"));
    console.log(`\n✔ Packed ${tgzFiles.length} package(s) into dist/\n`);
    for (const file of tgzFiles) {
      console.log(`    ${file}`);
    }
    console.log("");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n✘ Pack failed: ${message}\n`);
    process.exit(1);
  }
}
