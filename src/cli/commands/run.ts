import type { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  resolveAgentDir,
  checkDockerCompose,
  validateEnvFile,
  execDockerCompose,
} from "./docker-utils.js";

interface RunOptions {
  runtime?: string;
  outputDir?: string;
}

export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description("Start the Docker Compose stack for an installed agent")
    .argument("<agent>", "Agent package name to run")
    .option("--runtime <name>", "Start only this runtime (plus mcp-proxy)")
    .option("--output-dir <dir>", "Custom agent directory")
    .action(async (agentName: string, options: RunOptions) => {
      await runAgent(process.cwd(), agentName, options);
    });
}

export async function runAgent(
  rootDir: string,
  agentName: string,
  options: RunOptions,
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

    // 3. Validate .env
    const missingVars = validateEnvFile(agentDir);
    if (missingVars.length > 0) {
      console.error(
        `\n✘ Missing required environment variables in ${path.join(agentDir, ".env")}:\n${missingVars.map((v) => `  - ${v}`).join("\n")}\n\n  Fill in these values before running the agent.\n`,
      );
      process.exit(1);
      return;
    }

    // 4. Build docker compose args
    const args = ["compose", "-f", composePath, "up", "-d"];

    if (options.runtime) {
      // Validate runtime exists in compose file
      const composeContent = fs.readFileSync(composePath, "utf-8");
      // Simple check: look for the service name in the compose file
      const servicePattern = new RegExp(`^\\s+${options.runtime}:`, "m");
      if (!servicePattern.test(composeContent)) {
        console.error(
          `\n✘ Runtime "${options.runtime}" not found in ${composePath}\n`,
        );
        process.exit(1);
        return;
      }
      args.push("mcp-proxy", options.runtime);
    }

    // 5. Execute docker compose
    console.log(`Starting agent "${agentName}"...`);
    const exitCode = await execDockerCompose(args);

    if (exitCode !== 0) {
      process.exit(exitCode);
      return;
    }

    console.log(`\n✔ Agent "${agentName}" is running.\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n✘ Run failed: ${message}\n`);
    process.exit(1);
  }
}
