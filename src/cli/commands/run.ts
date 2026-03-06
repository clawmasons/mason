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

/**
 * Parse service names from a docker-compose.yml file.
 * Returns all top-level keys under the `services:` block.
 */
function parseServiceNames(composePath: string): string[] {
  const content = fs.readFileSync(composePath, "utf-8");
  const services: string[] = [];
  let inServices = false;

  for (const line of content.split("\n")) {
    if (/^services:\s*$/.test(line)) {
      inServices = true;
      continue;
    }
    // Top-level key (not indented) ends the services block
    if (inServices && /^\S/.test(line) && !line.startsWith("#")) {
      break;
    }
    // Service names are indented exactly 2 spaces followed by name:
    if (inServices) {
      const match = line.match(/^ {2}(\S+):\s*$/);
      if (match) {
        services.push(match[1]);
      }
    }
  }

  return services;
}

/**
 * Detect runtime services (everything except mcp-proxy) from compose file.
 */
function detectRuntimes(composePath: string): string[] {
  return parseServiceNames(composePath).filter((s) => s !== "mcp-proxy");
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
        `\n✘ Agent directory not found: ${agentDir}\n  Run "chapter install ${agentName}" first.\n`,
      );
      process.exit(1);
      return;
    }

    if (!fs.existsSync(composePath)) {
      console.error(
        `\n✘ docker-compose.yml not found in ${agentDir}\n  The agent may need to be reinstalled with "chapter install ${agentName}".\n`,
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

    // 4. Determine runtime to run
    let runtime = options.runtime;

    if (runtime) {
      // Validate runtime exists in compose file
      const composeContent = fs.readFileSync(composePath, "utf-8");
      const servicePattern = new RegExp(`^\\s+${runtime}:`, "m");
      if (!servicePattern.test(composeContent)) {
        console.error(
          `\n✘ Runtime "${runtime}" not found in ${composePath}\n`,
        );
        process.exit(1);
        return;
      }
    } else {
      // Auto-detect single runtime
      const runtimes = detectRuntimes(composePath);
      if (runtimes.length === 0) {
        console.error(
          `\n✘ No runtime services found in ${composePath}\n`,
        );
        process.exit(1);
        return;
      }
      if (runtimes.length > 1) {
        console.error(
          `\n✘ Multiple runtimes found: ${runtimes.join(", ")}\n  Use --runtime <name> to specify which runtime to start.\n`,
        );
        process.exit(1);
        return;
      }
      runtime = runtimes[0];
    }

    // 5. Phase 1: Start mcp-proxy detached
    console.log(`Starting mcp-proxy for "${agentName}"...`);
    const proxyArgs = ["compose", "-f", composePath, "up", "-d", "mcp-proxy"];
    const proxyExitCode = await execDockerCompose(proxyArgs);

    if (proxyExitCode !== 0) {
      process.exit(proxyExitCode);
      return;
    }

    // 6. Phase 2: Run runtime interactively
    console.log(`Starting runtime "${runtime}" interactively...`);
    const runtimeArgs = ["compose", "-f", composePath, "run", "--rm", runtime];
    const runtimeExitCode = await execDockerCompose(runtimeArgs);

    if (runtimeExitCode !== 0) {
      process.exit(runtimeExitCode);
      return;
    }

    console.log(`\n✔ Agent "${agentName}" session complete.\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n✘ Run failed: ${message}\n`);
    process.exit(1);
  }
}
