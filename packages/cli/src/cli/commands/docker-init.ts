import type { Command } from "commander";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Shape of the `.clawmasons/chapter.json` config file.
 */
interface ChapterConfig {
  chapter: string; // "<lodge-slug>.<chapter-slug>"
  version?: string;
}

/**
 * Read and validate `.clawmasons/chapter.json`.
 * Returns the parsed config or throws with a clear error.
 */
export function readChapterConfig(rootDir: string): ChapterConfig {
  const configPath = path.join(rootDir, ".clawmasons", "chapter.json");

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `No .clawmasons/chapter.json found. Run "chapter init" first to initialize the workspace.`,
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch {
    throw new Error(
      `.clawmasons/chapter.json is not valid JSON.`,
    );
  }

  if (
    typeof raw !== "object" ||
    raw === null ||
    !("chapter" in raw) ||
    typeof (raw as ChapterConfig).chapter !== "string"
  ) {
    throw new Error(
      `.clawmasons/chapter.json must contain a "chapter" field with the chapter name (e.g., "acme.platform").`,
    );
  }

  const config = raw as ChapterConfig;
  const chapterName = config.chapter;

  if (!chapterName.includes(".") || chapterName.startsWith(".") || chapterName.endsWith(".")) {
    throw new Error(
      `Invalid chapter name "${chapterName}" in .clawmasons/chapter.json. Must be in <lodge>.<chapter> format (e.g., "acme.platform").`,
    );
  }

  return config;
}

/**
 * Create the `docker/package.json` file listing all chapter packages
 * from `dist/*.tgz` as file dependencies.
 */
export function createDockerPackageJson(
  rootDir: string,
  chapterName: string,
): void {
  const dockerDir = path.join(rootDir, "docker");
  fs.mkdirSync(dockerDir, { recursive: true });

  const dockerPkgJson = {
    name: `@${chapterName}/docker`,
    version: "0.0.0",
    private: true,
    description: `Docker build context for ${chapterName} chapter`,
  };

  fs.writeFileSync(
    path.join(dockerDir, "package.json"),
    JSON.stringify(dockerPkgJson, null, 2) + "\n",
  );
}

/**
 * Add the `install-local` script to the root `package.json`.
 * If the script already exists, it is overwritten.
 */
export function addInstallLocalScript(rootDir: string): void {
  const pkgJsonPath = path.join(rootDir, "package.json");

  if (!fs.existsSync(pkgJsonPath)) {
    throw new Error(
      `No package.json found at project root. Run "npm init" or "chapter init" first.`,
    );
  }

  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
  if (!pkgJson.scripts) {
    pkgJson.scripts = {};
  }

  pkgJson.scripts["install-local"] = "cd docker && npm install ../dist/*.tgz";

  fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + "\n");
}

/**
 * Run the `install-local` script to populate `docker/node_modules/`.
 */
export function runInstallLocal(rootDir: string): void {
  const distDir = path.join(rootDir, "dist");

  if (!fs.existsSync(distDir)) {
    throw new Error(
      `No dist/ directory found. Pack your chapter packages first (e.g., "npm pack" in each workspace package).`,
    );
  }

  const tgzFiles = fs.readdirSync(distDir).filter((f) => f.endsWith(".tgz"));
  if (tgzFiles.length === 0) {
    throw new Error(
      `No .tgz files found in dist/. Pack your chapter packages first.`,
    );
  }

  try {
    execFileSync("npm", ["run", "install-local"], {
      cwd: rootDir,
      stdio: "inherit",
    });
  } catch {
    throw new Error(
      `install-local script failed. Check that dist/*.tgz files are valid npm packages.`,
    );
  }
}

export interface DockerInitDeps {
  /** Skip running npm install (for testing). */
  skipInstall?: boolean;
}

export function registerDockerInitCommand(program: Command): void {
  program
    .command("docker-init")
    .description("Set up Docker build system — scaffold docker/ directory and install local packages")
    .action(async () => {
      await runDockerInit(process.cwd());
    });
}

export async function runDockerInit(
  rootDir: string,
  deps?: DockerInitDeps,
): Promise<void> {
  try {
    // 1. Read chapter config
    const config = readChapterConfig(rootDir);
    const chapterName = config.chapter;
    console.log(`\n  Chapter: ${chapterName}\n`);

    // 2. Create docker/ directory with package.json
    createDockerPackageJson(rootDir, chapterName);
    console.log("  Created docker/package.json");

    // 3. Add install-local script to root package.json
    addInstallLocalScript(rootDir);
    console.log('  Added "install-local" script to package.json');

    // 4. Run install-local to populate docker/node_modules/
    if (!deps?.skipInstall) {
      console.log("\n  Running install-local...\n");
      runInstallLocal(rootDir);
      console.log("\n  docker/node_modules/ populated");
    }

    console.log("\n✔ docker-init complete\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n✘ docker-init failed: ${message}\n`);
    process.exit(1);
  }
}
