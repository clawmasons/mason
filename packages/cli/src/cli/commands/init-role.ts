import type { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import type { DiscoveredPackage, ResolvedAgent } from "@clawmasons/shared";
import { getAppShortName } from "@clawmasons/shared";
import { discoverPackages } from "../../resolver/discover.js";
import { resolveAgent } from "../../resolver/resolve.js";
import { readChapterConfig } from "./docker-init.js";
import {
  getClawmasonsHome,
  ensureClawmasonsHome,
  upsertRoleEntry,
  type ChapterEntry,
} from "../../runtime/home.js";
import { resolveRoleMountVolumes, type RoleMount } from "../../generator/mount-volumes.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface InitRoleOptions {
  role: string;
  agent?: string;
  targetDir?: string;
}

/**
 * Dependencies for initRole, injectable for testing.
 */
export interface InitRoleDeps {
  /** Override package discovery (for testing). */
  discoverPackagesFn?: (rootDir: string) => Map<string, DiscoveredPackage>;
  /** Override agent resolution (for testing). */
  resolveAgentFn?: (
    name: string,
    packages: Map<string, DiscoveredPackage>,
  ) => ResolvedAgent;
  /** Override chapter config reading (for testing). */
  readChapterConfigFn?: (rootDir: string) => { chapter: string };
  /** Override CLAWMASONS_HOME resolution (for testing). */
  getClawmasonsHomeFn?: () => string;
}

// ── Agent Resolution ──────────────────────────────────────────────────

/**
 * Resolve which agents to include for the given role.
 *
 * If `agentFlag` is provided, validates it exists and has the role.
 * Otherwise, discovers all agents that define the specified role.
 *
 * Returns the resolved agents with their short names.
 */
export function resolveAgentsForRole(
  roleName: string,
  agentFlag: string | undefined,
  packages: Map<string, DiscoveredPackage>,
  resolveAgentFn: (
    name: string,
    packages: Map<string, DiscoveredPackage>,
  ) => ResolvedAgent,
): Array<{ resolved: ResolvedAgent; shortName: string }> {
  // Collect all agent package names
  const agentNames: string[] = [];
  for (const [name, pkg] of packages) {
    if (pkg.chapterField.type === "agent") {
      agentNames.push(name);
    }
  }

  if (agentNames.length === 0) {
    throw new Error(
      "No agent packages found in this workspace. " +
        "Make sure you're in a chapter workspace root with an agents/ directory.",
    );
  }

  // If --agent is specified, resolve just that one
  if (agentFlag) {
    // Find the full package name matching the flag
    const fullName =
      agentNames.find((n) => n === agentFlag) ??
      agentNames.find((n) => getAppShortName(n) === agentFlag);

    if (!fullName) {
      throw new Error(
        `Agent "${agentFlag}" not found. Available agents: ${agentNames.join(", ")}`,
      );
    }

    const resolved = resolveAgentFn(fullName, packages);
    const roleShortName = getAppShortName(roleName);
    const hasRole = resolved.roles.some(
      (r) => r.name === roleName || getAppShortName(r.name) === roleShortName,
    );

    if (!hasRole) {
      throw new Error(
        `Agent "${fullName}" does not have role "${roleName}".`,
      );
    }

    return [{ resolved, shortName: getAppShortName(fullName) }];
  }

  // Resolve all agents and filter to those with the specified role
  const roleShortName = getAppShortName(roleName);
  const matching: Array<{ resolved: ResolvedAgent; shortName: string }> = [];

  for (const name of agentNames) {
    const resolved = resolveAgentFn(name, packages);
    const hasRole = resolved.roles.some(
      (r) => r.name === roleName || getAppShortName(r.name) === roleShortName,
    );

    if (hasRole) {
      matching.push({ resolved, shortName: getAppShortName(name) });
    }
  }

  if (matching.length === 0) {
    throw new Error(
      `Role "${roleName}" not found in any agent. Available agents: ${agentNames.join(", ")}`,
    );
  }

  return matching;
}

// ── Compose Generation ────────────────────────────────────────────────

/**
 * Generate a docker-compose.yaml for a host-wide role directory.
 *
 * Uses environment variable substitution ($\{PROJECT_DIR\}, $\{CHAPTER_PROXY_TOKEN\},
 * $\{CREDENTIAL_PROXY_TOKEN\}) so the compose file is reusable across projects.
 * Tokens are set at runtime by run-agent/run-acp-agent.
 */
export function generateInitRoleComposeYml(opts: {
  dockerBuildPath: string;
  agents: Array<{ name: string; shortName: string }>;
  role: string;
  roleShortName: string;
  roleMounts?: RoleMount[];
}): string {
  const { dockerBuildPath, agents, role, roleShortName, roleMounts } = opts;
  void role; // role is used only via roleShortName

  const proxyServiceName = `proxy-${roleShortName}`;
  const proxyDockerfile = `proxy/${roleShortName}/Dockerfile`;
  const credentialServiceDockerfile = "credential-service/Dockerfile";

  // Build role mount volume lines for agent services
  const roleMountLines = resolveRoleMountVolumes(roleMounts);

  let yaml = `# Generated by clawmasons init-role
services:
  ${proxyServiceName}:
    build:
      context: "${dockerBuildPath}"
      dockerfile: "${proxyDockerfile}"
    volumes:
      - "\${PROJECT_DIR}:/workspace"
      - "./logs:/logs"
    environment:
      - CHAPTER_PROXY_TOKEN=\${CHAPTER_PROXY_TOKEN}
      - CREDENTIAL_PROXY_TOKEN=\${CREDENTIAL_PROXY_TOKEN}
    restart: "no"

  credential-service:
    build:
      context: "${dockerBuildPath}"
      dockerfile: "${credentialServiceDockerfile}"
    environment:
      - CREDENTIAL_PROXY_TOKEN=\${CREDENTIAL_PROXY_TOKEN}
      - CREDENTIAL_PROXY_URL=ws://${proxyServiceName}:9090
    depends_on:
      - ${proxyServiceName}
    restart: "no"
`;

  for (const agent of agents) {
    const agentServiceName = `agent-${agent.shortName}-${roleShortName}`;
    const agentDockerfile = `agent/${agent.shortName}/${roleShortName}/Dockerfile`;

    // Build volume lines: workspace + role mounts
    const volumeLines = [`      - "\${PROJECT_DIR}:/workspace"`];
    for (const vol of roleMountLines) {
      volumeLines.push(`      - "${vol}"`);
    }

    yaml += `
  ${agentServiceName}:
    build:
      context: "${dockerBuildPath}"
      dockerfile: "${agentDockerfile}"
    volumes:
${volumeLines.join("\n")}
    depends_on:
      - credential-service
    environment:
      - MCP_PROXY_TOKEN=\${CHAPTER_PROXY_TOKEN}
    init: true
    restart: "no"
`;
  }

  return yaml;
}

// ── Command Registration ──────────────────────────────────────────────

export function registerInitRoleCommand(program: Command): void {
  program
    .command("init-role")
    .description(
      "Initialize a host-wide runtime directory for a chapter role",
    )
    .requiredOption("--role <name>", "Role to initialize")
    .option(
      "--agent <name>",
      "Specific agent to include (default: all agents with the role)",
    )
    .option(
      "--target-dir <path>",
      "Override the default role directory location",
    )
    .action(
      async (options: { role: string; agent?: string; targetDir?: string }) => {
        await initRole(process.cwd(), {
          role: options.role,
          agent: options.agent,
          targetDir: options.targetDir,
        });
      },
    );
}

// ── Main Orchestrator ─────────────────────────────────────────────────

export async function initRole(
  rootDir: string,
  options: InitRoleOptions,
  deps?: InitRoleDeps,
): Promise<void> {
  const discover = deps?.discoverPackagesFn ?? discoverPackages;
  const resolve = deps?.resolveAgentFn ?? resolveAgent;
  const readConfig = deps?.readChapterConfigFn ?? readChapterConfig;
  const getHome = deps?.getClawmasonsHomeFn ?? getClawmasonsHome;

  try {
    // 1. Read chapter config to get lodge.chapter identifier
    const config = readConfig(rootDir);
    const chapterName = config.chapter;
    const [lodge, chapter] = chapterName.split(".");

    if (!lodge || !chapter) {
      throw new Error(
        `Invalid chapter name "${chapterName}". Must be in <lodge>.<chapter> format.`,
      );
    }

    console.log(`\n  Chapter: ${chapterName}`);

    // 2. Resolve CLAWMASONS_HOME
    const home = getHome();
    ensureClawmasonsHome(home);

    // 3. Discover packages and resolve agents for the role
    const packages = discover(rootDir);
    const roleShortName = getAppShortName(options.role);
    const agentsForRole = resolveAgentsForRole(
      options.role,
      options.agent,
      packages,
      resolve,
    );

    const agentShortNames = agentsForRole.map((a) => a.shortName);
    console.log(`  Role: ${roleShortName}`);
    console.log(`  Agents: ${agentShortNames.join(", ")}`);

    // 4. Determine role directory
    const defaultRoleDir = path.join(home, lodge, chapter, roleShortName);
    const roleDir = options.targetDir
      ? path.resolve(options.targetDir)
      : defaultRoleDir;

    console.log(`  Role directory: ${roleDir}`);

    // 5. Create role directory
    fs.mkdirSync(roleDir, { recursive: true });
    fs.mkdirSync(path.join(roleDir, "logs"), { recursive: true });

    // 6. Backup existing docker-compose.yaml if present
    const composeFile = path.join(roleDir, "docker-compose.yaml");
    if (fs.existsSync(composeFile)) {
      const backupFile = path.join(roleDir, "docker-compose.yaml.bak");
      fs.copyFileSync(composeFile, backupFile);
      console.log(`  Backed up existing docker-compose.yaml to .bak`);
    }

    // 7. Resolve docker build path
    const dockerBuildPath = path.join(rootDir, "docker");
    if (!fs.existsSync(dockerBuildPath)) {
      throw new Error(
        `Docker build directory not found at ${dockerBuildPath}. Run "clawmasons build" first.`,
      );
    }

    // 8. Generate docker-compose.yaml
    const composeContent = generateInitRoleComposeYml({
      dockerBuildPath,
      agents: agentsForRole.map((a) => ({
        name: a.resolved.name,
        shortName: a.shortName,
      })),
      role: options.role,
      roleShortName,
    });

    fs.writeFileSync(composeFile, composeContent);
    console.log(`  Created docker-compose.yaml`);

    // 9. Update chapters.json
    const now = new Date().toISOString();
    const entry: ChapterEntry = {
      lodge,
      chapter,
      role: roleShortName,
      dockerBuild: dockerBuildPath,
      roleDir,
      ...(options.targetDir ? { targetDir: path.resolve(options.targetDir) } : {}),
      agents: agentShortNames,
      createdAt: now,
      updatedAt: now,
    };

    upsertRoleEntry(home, entry);
    console.log(`  Updated chapters.json`);

    console.log(`\n  init-role complete\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n  init-role failed: ${message}\n`);
    process.exit(1);
  }
}
