import type { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import { getAppShortName } from "@clawmasons/shared";
import type { DiscoveredPackage, ResolvedAgent } from "@clawmasons/shared";
import { discoverPackages } from "../../resolver/discover.js";
import { resolveAgent } from "../../resolver/resolve.js";
import { validateAgent } from "../../validator/validate.js";
import { runPack } from "./pack.js";
import { runDockerInit } from "./docker-init.js";

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

/**
 * Discover all agent package names from the discovered packages.
 */
function discoverAgentNames(packages: Map<string, DiscoveredPackage>): string[] {
  const agents: string[] = [];
  for (const [name, pkg] of packages) {
    if (pkg.chapterField.type === "agent") {
      agents.push(name);
    }
  }
  return agents;
}

/**
 * Resolve which agent(s) to build:
 * - If agentName is provided, return [agentName]
 * - If only one agent exists, auto-detect it
 * - If multiple agents exist, return all of them
 */
function resolveAgentsToBuild(
  agentName: string | undefined,
  packages: Map<string, DiscoveredPackage>,
): string[] {
  if (agentName) return [agentName];

  const agents = discoverAgentNames(packages);

  if (agents.length === 0) {
    throw new Error(
      "No agent packages found in this workspace. " +
      "Make sure you're in a chapter workspace root with an agents/ directory.",
    );
  }

  return agents;
}

/**
 * Display completion instructions after a successful build.
 */
function displayCompletionInstructions(agents: ResolvedAgent[]): void {
  console.log("\n  Build complete!\n");

  // Collect unique agent x role combinations
  const examples: Array<{ agentShort: string; roleShort: string }> = [];
  for (const agent of agents) {
    const agentShort = getAppShortName(agent.name);
    for (const role of agent.roles) {
      const roleShort = getAppShortName(role.name);
      examples.push({ agentShort, roleShort });
    }
  }

  const first = examples[0];
  if (first) {
    console.log("  Run a role:");
    console.log(`    clawmasons run ${first.agentShort} --role ${first.roleShort}`);

    if (examples.length > 1) {
      console.log("\n  Other combinations:");
      for (let i = 1; i < examples.length; i++) {
        const ex = examples[i];
        if (ex) {
          console.log(`    clawmasons run ${ex.agentShort} --role ${ex.roleShort}`);
        }
      }
    }

    console.log("\n  Configure an ACP client:");
    console.log(`    clawmasons run ${first.agentShort} --acp --role ${first.roleShort}`);

    console.log("\n  Example ACP client configuration:");
    console.log("    {");
    console.log('      "mcpServers": {');
    console.log('        "clawmasons": {');
    console.log('          "command": "clawmasons",');
    console.log(`          "args": ["run", "${first.agentShort}", "--acp", "--role", "${first.roleShort}"]`);
    console.log("        }");
    console.log("      }");
    console.log("    }");
  }

  console.log("");
}

export function registerBuildCommand(program: Command): void {
  program
    .command("build")
    .description("Build chapter workspace: resolve agents, pack packages, and generate Docker artifacts")
    .argument("[agent]", "Agent package name to build (auto-detects if only one; builds all if omitted with multiple)")
    .option("--output <path>", "Output path for lock file")
    .option("--json", "Print lock file to stdout as JSON instead of writing to file")
    .action(async (agentName: string | undefined, options: BuildOptions) => {
      await runBuild(process.cwd(), agentName, options);
    });
}

export async function runBuild(
  rootDir: string,
  agentName: string | undefined,
  options: BuildOptions,
): Promise<void> {
  try {
    // 1. Discover packages
    const packages = discoverPackages(rootDir);

    // 2. Resolve which agents to build
    const agentNames = resolveAgentsToBuild(agentName, packages);

    // 3. Resolve and validate all agents
    const resolvedAgents: ResolvedAgent[] = [];
    for (const name of agentNames) {
      const agent = resolveAgent(name, packages);

      const validation = validateAgent(agent);
      if (!validation.valid) {
        const errorLines = validation.errors.map((e) => `  - [${e.category}] ${e.message}`);
        console.error(
          `\n✘ Agent "${name}" failed validation with ${validation.errors.length} error(s):\n${errorLines.join("\n")}\n`,
        );
        process.exit(1);
        return;
      }
      if (validation.warnings.length > 0) {
        for (const w of validation.warnings) {
          console.warn(`  ⚠ [${w.category}] ${w.message}`);
        }
      }

      resolvedAgents.push(agent);
    }

    // 4. Generate lock file for the first (or only) agent
    const primaryAgent = resolvedAgents[0];
    if (!primaryAgent) {
      throw new Error("No agents resolved — this should not happen.");
    }
    const lockFile = generateLockFile(primaryAgent, []);

    if (options.json) {
      console.log(JSON.stringify(lockFile, null, 2));
    } else {
      const outputPath = options.output
        ? path.resolve(rootDir, options.output)
        : path.join(rootDir, "chapter.lock.json");

      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(lockFile, null, 2));
      console.log(`\n✔ Lock file written to ${outputPath}`);
    }

    // 5. Pack workspace packages
    console.log("\n  Running pack...\n");
    await runPack(rootDir);

    // 6. Run docker-init
    console.log("\n  Running docker-init...\n");
    await runDockerInit(rootDir);

    // 7. Display completion instructions
    displayCompletionInstructions(resolvedAgents);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n✘ Build failed: ${message}\n`);
    process.exit(1);
  }
}
