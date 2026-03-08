import type { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import { discoverPackages } from "../../resolver/discover.js";
import { resolveAgent } from "../../resolver/resolve.js";
import { validateAgent } from "../../validator/validate.js";
import type { ResolvedAgent } from "@clawmasons/shared";

interface BuildOptions {
  output?: string;
  json?: boolean;
}

/**
 * Lock file structure for reproducible builds.
 */
interface LockFile {
  lockVersion: number;
  agent: { name: string; version: string; runtimes: string[] };
  roles: Array<{
    name: string;
    version: string;
    tasks: Array<{ name: string; version: string }>;
    apps: Array<{ name: string; version: string }>;
    skills: Array<{ name: string; version: string }>;
  }>;
  generatedFiles: string[];
}

/**
 * Generate a chapter.lock.json object from a resolved agent and
 * the list of generated file paths.
 */
function generateLockFile(
  agent: ResolvedAgent,
  generatedFiles: string[],
): LockFile {
  const roles = agent.roles.map((role) => ({
    name: role.name,
    version: role.version,
    tasks: role.tasks.map((t) => ({ name: t.name, version: t.version })),
    apps: role.apps.map((a) => ({ name: a.name, version: a.version })),
    skills: role.skills.map((s) => ({ name: s.name, version: s.version })),
  }));

  return {
    lockVersion: 1,
    agent: {
      name: agent.name,
      version: agent.version,
      runtimes: [...agent.runtimes],
    },
    roles,
    generatedFiles: [...generatedFiles].sort(),
  };
}

export function registerBuildCommand(program: Command): void {
  program
    .command("build")
    .description("Resolve agent graph and generate chapter.lock.json")
    .argument("<agent>", "Agent package name to build")
    .option("--output <path>", "Output path for lock file")
    .option("--json", "Print lock file to stdout as JSON instead of writing to file")
    .action(async (agentName: string, options: BuildOptions) => {
      await runBuild(process.cwd(), agentName, options);
    });
}

export async function runBuild(
  rootDir: string,
  agentName: string,
  options: BuildOptions,
): Promise<void> {
  try {
    // 1. Discover packages
    const packages = discoverPackages(rootDir);

    // 2. Resolve agent graph
    const agent = resolveAgent(agentName, packages);

    // 3. Validate
    const validation = validateAgent(agent);
    if (!validation.valid) {
      const errorLines = validation.errors.map((e) => `  - [${e.category}] ${e.message}`);
      console.error(
        `\n✘ Agent "${agentName}" failed validation with ${validation.errors.length} error(s):\n${errorLines.join("\n")}\n`,
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
    const lockFile = generateLockFile(agent, []);

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
