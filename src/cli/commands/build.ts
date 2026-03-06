import type { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import { discoverPackages } from "../../resolver/discover.js";
import { resolveMember } from "../../resolver/resolve.js";
import { validateMember } from "../../validator/validate.js";
import { generateLockFile } from "../../compose/lock.js";

interface BuildOptions {
  output?: string;
  json?: boolean;
}

export function registerBuildCommand(program: Command): void {
  program
    .command("build")
    .description("Resolve member graph and generate chapter.lock.json")
    .argument("<member>", "Member package name to build")
    .option("--output <path>", "Output path for lock file")
    .option("--json", "Print lock file to stdout as JSON instead of writing to file")
    .action(async (memberName: string, options: BuildOptions) => {
      await runBuild(process.cwd(), memberName, options);
    });
}

export async function runBuild(
  rootDir: string,
  memberName: string,
  options: BuildOptions,
): Promise<void> {
  try {
    // 1. Discover packages
    const packages = discoverPackages(rootDir);

    // 2. Resolve member graph
    const member = resolveMember(memberName, packages);

    // 3. Validate
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

    // 4. Generate lock file (empty generated files — build doesn't scaffold)
    const lockFile = generateLockFile(member, []);

    if (options.json) {
      console.log(JSON.stringify(lockFile, null, 2));
    } else {
      const outputPath = options.output
        ? path.resolve(rootDir, options.output)
        : path.join(rootDir, "chapter.lock.json");

      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(lockFile, null, 2));
      console.log(`\n✔ Lock file written to ${outputPath}\n`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n✘ Build failed: ${message}\n`);
    process.exit(1);
  }
}
