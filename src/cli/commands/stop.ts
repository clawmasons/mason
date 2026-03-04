import type { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  resolveAgentDir,
  checkDockerCompose,
  execDockerCompose,
} from "./docker-utils.js";

interface StopOptions {
  outputDir?: string;
}

export function registerStopCommand(program: Command): void {
  program
    .command("stop")
    .description("Stop the Docker Compose stack for an agent")
    .argument("<agent>", "Agent package name to stop")
    .option("--output-dir <dir>", "Custom agent directory")
    .action(async (agentName: string, options: StopOptions) => {
      await stopAgent(process.cwd(), agentName, options);
    });
}

export async function stopAgent(
  rootDir: string,
  agentName: string,
  options: StopOptions,
): Promise<void> {
  try {
    // 1. Check docker compose availability
    checkDockerCompose();

    // 2. Resolve agent directory
    const agentDir = resolveAgentDir(rootDir, agentName, options.outputDir);
    const composePath = path.join(agentDir, "docker-compose.yml");

    if (!fs.existsSync(agentDir)) {
      console.error(
        `\n✘ Agent directory not found: ${agentDir}\n  Run "pam install ${agentName}" first.\n`,
      );
      process.exit(1);
      return;
    }

    if (!fs.existsSync(composePath)) {
      console.error(
        `\n✘ docker-compose.yml not found in ${agentDir}\n  The agent may need to be reinstalled with "pam install ${agentName}".\n`,
      );
      process.exit(1);
      return;
    }

    // 3. Execute docker compose down
    console.log(`Stopping agent "${agentName}"...`);
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

    console.log(`\n✔ Agent "${agentName}" stopped.\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n✘ Stop failed: ${message}\n`);
    process.exit(1);
  }
}
