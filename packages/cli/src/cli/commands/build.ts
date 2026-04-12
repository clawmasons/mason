/**
 * `mason build` command — generates project-local Docker build artifacts.
 *
 * Discovers roles in the current workspace, resolves their agent types,
 * and generates Docker build directories at `.mason/docker/<role-name>/`.
 *
 * This replaces the old build pipeline that used lodge-based paths.
 */
import type { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  discoverRoles,
  adaptRoleToResolvedAgent,
  getAppShortName,
  type Role,
} from "@clawmasons/shared";
import { generateRoleDockerBuildDir } from "../../materializer/docker-generator.js";
import { ensureProxyDependencies, ensureSharedProxyBundle, copyAgentEntryBundle } from "../../materializer/proxy-dependencies.js";
import { generateProxyDockerfile } from "../../generator/proxy-dockerfile.js";
import { inferAgentType, resolveAgentType } from "./run-agent.js";
import { readDefaultAgent } from "@clawmasons/agent-sdk";
import { ensureGitignoreEntry } from "../../runtime/gitignore.js";

/**
 * Build Docker artifacts for a single role.
 */
function buildRole(
  role: Role,
  agentType: string,
  projectDir: string,
): { roleName: string; buildDir: string } {
  const roleName = getAppShortName(role.metadata.name);

  const result = generateRoleDockerBuildDir({
    role,
    agentType,
    projectDir,
    agentName: roleName,
  });

  return { roleName, buildDir: result.buildDir };
}

/**
 * Run the build for one or all roles in the workspace.
 *
 * @param projectDir - Absolute path to the project root
 * @param roleName - Optional role name to build (builds all if omitted)
 * @param agentTypeOverride - Optional agent type override (e.g., "claude-code-agent")
 */
export async function runBuild(
  projectDir: string,
  roleName?: string,
  agentTypeOverride?: string,
): Promise<void> {
  // 1. Discover roles
  const roles = await discoverRoles(projectDir);

  if (roles.length === 0) {
    console.error("\n  No roles found in workspace.\n");
    process.exit(1);
    return;
  }

  // 2. Filter to requested role(s)
  let targetRoles = roles;
  if (roleName) {
    const match = roles.find(
      (r) => getAppShortName(r.metadata.name) === roleName || r.metadata.name === roleName,
    );
    if (!match) {
      const available = roles.map((r) => getAppShortName(r.metadata.name)).join(", ");
      console.error(`\n  Role "${roleName}" not found. Available: ${available}\n`);
      process.exit(1);
      return;
    }
    targetRoles = [match];
  }

  // 3. Validate roles via adapter round-trip
  const defaultAgent = readDefaultAgent(projectDir);
  for (const role of targetRoles) {
    const agentType = agentTypeOverride ?? inferAgentType(role, defaultAgent);
    try {
      adaptRoleToResolvedAgent(role, agentType);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\n  Validation failed for "${getAppShortName(role.metadata.name)}": ${msg}\n`);
      process.exit(1);
      return;
    }
  }

  // 4. Ensure .mason/.gitignore
  const masonDir = path.join(projectDir, ".mason");
  fs.mkdirSync(masonDir, { recursive: true });
  const gitignorePath = path.join(masonDir, ".gitignore");
  if (!fs.existsSync(gitignorePath) || !fs.readFileSync(gitignorePath, "utf-8").includes("docker/")) {
    fs.appendFileSync(gitignorePath, "docker/\nsessions/\n");
  }
  ensureGitignoreEntry(projectDir, ".mason");

  // 5. Build Docker artifacts for each role
  console.log(`\n  Building ${targetRoles.length} role(s)...\n`);

  for (const role of targetRoles) {
    const agentType = agentTypeOverride ?? inferAgentType(role, defaultAgent);
    const { roleName: name } = buildRole(role, agentType, projectDir);
    console.log(`  ✓ ${name} (${agentType}) → .mason/docker/${name}/`);
  }

  // 6. Generate shared proxy Dockerfile and bundle (once, outside per-role loop)
  const dockerDir = path.join(projectDir, ".mason", "docker");
  copyAgentEntryBundle(dockerDir);

  const sharedProxyDir = path.join(dockerDir, "mcp-proxy");
  fs.mkdirSync(sharedProxyDir, { recursive: true });
  fs.writeFileSync(path.join(sharedProxyDir, "Dockerfile"), generateProxyDockerfile());
  ensureSharedProxyBundle(dockerDir);

  // 7. Generate per-role proxy config
  for (const role of targetRoles) {
    ensureProxyDependencies(dockerDir, role);
  }

  console.log(`\n  Build complete.\n`);
}

/**
 * Register the `build` subcommand.
 */
export function registerBuildCommand(program: Command): void {
  program
    .command("build")
    .description("Build Docker artifacts for roles in the workspace")
    .argument("[role]", "Role name to build (builds all if omitted)")
    .option("--agent-type <type>", "Override agent type (e.g., claude-code-agent, pi-coding-agent)")
    .action(async (role: string | undefined, options: { agentType?: string }) => {
      let agentType: string | undefined;
      if (options.agentType) {
        agentType = resolveAgentType(options.agentType);
        if (!agentType) {
          console.error(`\n  Unknown agent type "${options.agentType}".\n`);
          process.exit(1);
          return;
        }
      }
      await runBuild(process.cwd(), role, agentType);
    });
}
