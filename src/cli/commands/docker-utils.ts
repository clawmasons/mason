import * as fs from "node:fs";
import * as path from "node:path";
import { execSync, spawn } from "node:child_process";
import { getAppShortName } from "../../generator/toolfilter.js";

/**
 * Resolve the scaffolded agent directory.
 * Uses `.chapter/agents/<short-name>/` by default, or a custom outputDir if provided.
 */
export function resolveAgentDir(
  rootDir: string,
  agentName: string,
  outputDir?: string,
): string {
  if (outputDir) {
    return path.resolve(rootDir, outputDir);
  }
  const shortName = getAppShortName(agentName);
  return path.join(rootDir, ".chapter", "agents", shortName);
}

/**
 * Check that `docker compose` (v2) is available on the system.
 * Throws if not found.
 */
export function checkDockerCompose(): void {
  try {
    execSync("docker compose version", { stdio: "ignore" });
  } catch {
    throw new Error(
      "Docker Compose v2 is required but not found. Install Docker Desktop or the compose plugin.",
    );
  }
}

/**
 * Validate that the .env file exists and all variables have non-empty values.
 * Returns the list of variable names that are missing values.
 */
export function validateEnvFile(agentDir: string): string[] {
  const envPath = path.join(agentDir, ".env");

  if (!fs.existsSync(envPath)) {
    throw new Error(
      `No .env file found at ${envPath}. Run chapter install first to generate credentials template.`,
    );
  }

  const content = fs.readFileSync(envPath, "utf-8");
  const missing: string[] = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();

    if (!value) {
      missing.push(key);
    }
  }

  return missing;
}

/**
 * Execute a docker compose command, streaming output to the terminal.
 * Returns the exit code.
 */
export function execDockerCompose(args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("docker", args, { stdio: "inherit" });
    child.on("close", (code) => resolve(code ?? 0));
    child.on("error", () => resolve(1));
  });
}
