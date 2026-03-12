import type { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import { discoverRoles, adaptRoleToResolvedAgent } from "@clawmasons/shared";
import type { RoleType } from "@clawmasons/shared";
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
  role: { name: string; version: string };
  tasks: Array<{ name: string }>;
  apps: Array<{ name: string }>;
  skills: Array<{ name: string }>;
  generatedFiles: string[];
}

/**
 * Generate a chapter.lock.json object from a resolved role
 * and the list of generated file paths.
 */
function generateLockFile(
  role: RoleType,
  generatedFiles: string[],
): LockFile {
  return {
    lockVersion: 2,
    role: {
      name: role.metadata.name,
      version: role.metadata.version ?? "0.0.0",
    },
    tasks: role.tasks.map((t) => ({ name: t.name })),
    apps: role.apps.map((a) => ({ name: a.name })),
    skills: role.skills.map((s) => ({ name: s.name })),
    generatedFiles: [...generatedFiles].sort(),
  };
}

/**
 * Display completion instructions after a successful build.
 */
function displayCompletionInstructions(roles: RoleType[]): void {
  console.log("\n  Build complete!\n");

  const examples: Array<{ roleName: string }> = [];
  for (const role of roles) {
    examples.push({ roleName: role.metadata.name });
  }

  const first = examples[0];
  if (first) {
    console.log("  Run a role:");
    console.log(`    clawmasons run claude --role ${first.roleName}`);

    if (examples.length > 1) {
      console.log("\n  Other roles:");
      for (let i = 1; i < examples.length; i++) {
        const ex = examples[i];
        if (ex) {
          console.log(`    clawmasons run claude --role ${ex.roleName}`);
        }
      }
    }

    console.log("\n  Configure an ACP client:");
    console.log(`    clawmasons run claude --acp --role ${first.roleName}`);

    console.log("\n  Example ACP client configuration:");
    console.log("    {");
    console.log('      "mcpServers": {');
    console.log('        "clawmasons": {');
    console.log('          "command": "clawmasons",');
    console.log(`          "args": ["run", "claude", "--acp", "--role", "${first.roleName}"]`);
    console.log("        }");
    console.log("      }");
    console.log("    }");
  }

  console.log("");
}

export function registerBuildCommand(program: Command): void {
  program
    .command("build")
    .description("Build chapter workspace: discover roles, pack packages, and generate Docker artifacts")
    .argument("[role]", "Role name to build (builds all discovered roles if omitted)")
    .option("--output <path>", "Output path for lock file")
    .option("--json", "Print lock file to stdout as JSON instead of writing to file")
    .action(async (roleName: string | undefined, options: BuildOptions) => {
      await runBuild(process.cwd(), roleName, options);
    });
}

export async function runBuild(
  rootDir: string,
  roleName: string | undefined,
  options: BuildOptions,
): Promise<void> {
  try {
    // 1. Discover roles
    const allRoles = await discoverRoles(rootDir);

    if (allRoles.length === 0) {
      throw new Error(
        "No roles found in this workspace. " +
        "Create a ROLE.md in .claude/roles/, .codex/roles/, or .aider/roles/.",
      );
    }

    // 2. Filter to requested role(s)
    const rolesToBuild = roleName
      ? allRoles.filter((r) => r.metadata.name === roleName)
      : allRoles;

    if (rolesToBuild.length === 0) {
      throw new Error(
        `Role "${roleName}" not found. Available roles: ${allRoles.map((r) => r.metadata.name).join(", ")}`,
      );
    }

    // 3. Validate all roles via adapter round-trip
    for (const role of rolesToBuild) {
      const agentType = role.source.agentDialect ?? "claude-code";
      const resolvedAgent = adaptRoleToResolvedAgent(role, agentType);

      const validation = validateAgent(resolvedAgent);
      if (!validation.valid) {
        const errorLines = validation.errors.map((e) => `  - [${e.category}] ${e.message}`);
        console.error(
          `\n  Role "${role.metadata.name}" failed validation with ${validation.errors.length} error(s):\n${errorLines.join("\n")}\n`,
        );
        process.exit(1);
        return;
      }
      if (validation.warnings.length > 0) {
        for (const w of validation.warnings) {
          console.warn(`  [${w.category}] ${w.message}`);
        }
      }
    }

    // 4. Generate lock file for the first (or only) role
    const primaryRole = rolesToBuild[0];
    if (!primaryRole) {
      throw new Error("No roles resolved — this should not happen.");
    }
    const lockFile = generateLockFile(primaryRole, []);

    if (options.json) {
      console.log(JSON.stringify(lockFile, null, 2));
    } else {
      const outputPath = options.output
        ? path.resolve(rootDir, options.output)
        : path.join(rootDir, "chapter.lock.json");

      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(lockFile, null, 2));
      console.log(`\n  Lock file written to ${outputPath}`);
    }

    // 5. Pack workspace packages
    console.log("\n  Running pack...\n");
    await runPack(rootDir);

    // 6. Run docker-init
    console.log("\n  Running docker-init...\n");
    await runDockerInit(rootDir);

    // 7. Display completion instructions
    displayCompletionInstructions(rolesToBuild);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n  Build failed: ${message}\n`);
    process.exit(1);
  }
}
