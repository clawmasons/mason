import type { Command } from "commander";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseChapterField } from "../../schemas/index.js";

interface AddOptions {
  npmArgs: string[];
}

export function registerAddCommand(program: Command): void {
  program
    .command("add")
    .description("Add a chapter package dependency (wraps npm install with chapter validation)")
    .argument("<pkg>", "Package name to add")
    .argument("[npmArgs...]", "Additional arguments forwarded to npm install")
    .action(async (pkg: string, npmArgs: string[]) => {
      await runAdd(process.cwd(), pkg, { npmArgs });
    });
}

export async function runAdd(
  rootDir: string,
  pkg: string,
  options: AddOptions,
): Promise<void> {
  try {
    // 1. Run npm install
    console.log(`Installing ${pkg}...`);
    const npmInstallArgs = ["install", pkg, ...options.npmArgs];
    try {
      execFileSync("npm", npmInstallArgs, {
        cwd: rootDir,
        stdio: "inherit",
      });
    } catch {
      console.error(`\n✘ Add failed: npm install exited with an error\n`);
      process.exit(1);
      return;
    }

    // 2. Validate chapter field on the installed package
    const pkgJsonPath = path.join(rootDir, "node_modules", ...pkg.split("/"), "package.json");
    if (!fs.existsSync(pkgJsonPath)) {
      console.error(`\n✘ Add failed: could not find installed package at ${pkgJsonPath}\n`);
      process.exit(1);
      return;
    }

    let pkgJson: { name?: string; chapter?: unknown };
    try {
      pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
    } catch {
      rollbackInstall(rootDir, pkg);
      console.error(`\n✘ Add failed: could not parse package.json for ${pkg}\n`);
      process.exit(1);
      return;
    }

    if (!pkgJson.chapter) {
      rollbackInstall(rootDir, pkg);
      console.error(
        `\n✘ Add failed: ${pkg} is not a valid chapter package (missing "chapter" field in package.json)\n`,
      );
      process.exit(1);
      return;
    }

    const result = parseChapterField(pkgJson.chapter);
    if (!result.success) {
      rollbackInstall(rootDir, pkg);
      const issues = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
      console.error(
        `\n✘ Add failed: ${pkg} has an invalid chapter field:\n${issues.join("\n")}\n`,
      );
      process.exit(1);
      return;
    }

    console.log(`\n✔ Added ${pkg} (type: ${result.data.type})\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n✘ Add failed: ${message}\n`);
    process.exit(1);
  }
}

function rollbackInstall(rootDir: string, pkg: string): void {
  try {
    console.log(`Rolling back: uninstalling ${pkg}...`);
    execFileSync("npm", ["uninstall", pkg], {
      cwd: rootDir,
      stdio: "inherit",
    });
  } catch {
    // Best-effort rollback — don't fail on rollback failure
  }
}
