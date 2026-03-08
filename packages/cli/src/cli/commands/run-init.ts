import type { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { readChapterConfig } from "./docker-init.js";

/**
 * Shape of the run-init `.clawmasons/chapter.json` config file.
 * This is the project-side config (different from the chapter-project-side config
 * read by docker-init).
 */
export interface RunConfig {
  chapter: string;
  "docker-registries": string[];
  "docker-build": string;
}

/**
 * Prompt the user for input via readline.
 * Returns the trimmed response.
 */
export function promptUser(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Validate that the given path points to a valid chapter docker build directory.
 * The docker/ directory must exist and contain a package.json.
 * The parent directory must have .clawmasons/chapter.json with a valid chapter name.
 *
 * Returns the chapter identifier (e.g., "acme.platform").
 */
export function validateDockerBuildPath(dockerBuildPath: string): string {
  if (!path.isAbsolute(dockerBuildPath)) {
    throw new Error(
      `Docker build path must be an absolute path. Got: "${dockerBuildPath}"`,
    );
  }

  if (!fs.existsSync(dockerBuildPath)) {
    throw new Error(
      `Docker build directory not found: "${dockerBuildPath}"`,
    );
  }

  if (!fs.statSync(dockerBuildPath).isDirectory()) {
    throw new Error(
      `Docker build path is not a directory: "${dockerBuildPath}"`,
    );
  }

  // The docker/ directory should have a package.json (created by docker-init)
  const dockerPkgPath = path.join(dockerBuildPath, "package.json");
  if (!fs.existsSync(dockerPkgPath)) {
    throw new Error(
      `No package.json found in docker build directory. Run "chapter docker-init" in the chapter project first.`,
    );
  }

  // Read the chapter config from the parent directory
  const chapterProjectRoot = path.dirname(dockerBuildPath);
  const config = readChapterConfig(chapterProjectRoot);

  return config.chapter;
}

export interface RunInitDeps {
  /** Override the prompt function (for testing). */
  promptFn?: (question: string) => Promise<string>;
}

export function registerRunInitCommand(program: Command): void {
  program
    .command("run-init")
    .description("Initialize a project directory for running chapter agents")
    .action(async () => {
      await runRunInit(process.cwd());
    });
}

export async function runRunInit(
  projectDir: string,
  deps?: RunInitDeps,
): Promise<void> {
  try {
    const clawmasonsDir = path.join(projectDir, ".clawmasons");
    const configPath = path.join(clawmasonsDir, "chapter.json");

    // Idempotency: if chapter.json already exists, preserve it
    if (fs.existsSync(configPath)) {
      console.log(
        "\n  .clawmasons/chapter.json already exists. Preserving existing configuration.",
      );

      // Still ensure subdirectories exist
      fs.mkdirSync(path.join(clawmasonsDir, "logs"), { recursive: true });
      fs.mkdirSync(path.join(clawmasonsDir, "workspace"), { recursive: true });

      console.log("  Ensured logs/ and workspace/ directories exist.");
      console.log("\n  run-init complete (idempotent — no changes to config)\n");
      return;
    }

    // Prompt for the docker build path
    const prompt = deps?.promptFn ?? promptUser;
    const dockerBuildPath = await prompt(
      "\n  Path to chapter docker/ directory (absolute path): ",
    );

    if (!dockerBuildPath) {
      throw new Error("No docker build path provided.");
    }

    // Validate the docker build path and get the chapter identifier
    const chapterName = validateDockerBuildPath(dockerBuildPath);

    // Create .clawmasons/ directory structure
    fs.mkdirSync(clawmasonsDir, { recursive: true });
    fs.mkdirSync(path.join(clawmasonsDir, "logs"), { recursive: true });
    fs.mkdirSync(path.join(clawmasonsDir, "workspace"), { recursive: true });

    // Write chapter.json
    const runConfig: RunConfig = {
      chapter: chapterName,
      "docker-registries": ["local"],
      "docker-build": dockerBuildPath,
    };

    fs.writeFileSync(configPath, JSON.stringify(runConfig, null, 2) + "\n");

    console.log(`\n  Chapter: ${chapterName}`);
    console.log(`  Docker build: ${dockerBuildPath}`);
    console.log("\n  Created:");
    console.log("    .clawmasons/chapter.json");
    console.log("    .clawmasons/logs/");
    console.log("    .clawmasons/workspace/");
    console.log("\n  run-init complete\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n  run-init failed: ${message}\n`);
    process.exit(1);
  }
}
