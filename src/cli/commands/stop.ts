import type { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  resolveMemberDir,
  checkDockerCompose,
  execDockerCompose,
} from "./docker-utils.js";

interface StopOptions {
  outputDir?: string;
}

export function registerStopCommand(program: Command): void {
  program
    .command("stop")
    .description("Stop the Docker Compose stack for a member")
    .argument("<member>", "Member package name to stop")
    .option("--output-dir <dir>", "Custom member directory")
    .action(async (memberName: string, options: StopOptions) => {
      await stopAgent(process.cwd(), memberName, options);
    });
}

export async function stopAgent(
  rootDir: string,
  memberName: string,
  options: StopOptions,
): Promise<void> {
  try {
    // 1. Check docker compose availability
    checkDockerCompose();

    // 2. Resolve member directory
    const memberDir = resolveMemberDir(rootDir, memberName, options.outputDir);
    const composePath = path.join(memberDir, "docker-compose.yml");

    if (!fs.existsSync(memberDir)) {
      console.error(
        `\n✘ Member directory not found: ${memberDir}\n  Run "chapter install ${memberName}" first.\n`,
      );
      process.exit(1);
      return;
    }

    if (!fs.existsSync(composePath)) {
      console.error(
        `\n✘ docker-compose.yml not found in ${memberDir}\n  The member may need to be reinstalled with "chapter install ${memberName}".\n`,
      );
      process.exit(1);
      return;
    }

    // 3. Execute docker compose down
    console.log(`Stopping member "${memberName}"...`);
    const exitCode = await execDockerCompose([
      "compose",
      "-f",
      composePath,
      "down",
    ]);

    if (exitCode !== 0) {
      process.exit(exitCode);
      return;
    }

    console.log(`\n✔ Member "${memberName}" stopped.\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n✘ Stop failed: ${message}\n`);
    process.exit(1);
  }
}
