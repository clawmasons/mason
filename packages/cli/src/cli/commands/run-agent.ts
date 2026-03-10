import type { Command } from "commander";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import type { RunConfig } from "./run-init.js";
import { checkDockerCompose } from "./docker-utils.js";
import {
  getClawmasonsHome,
  findRoleEntryByRole,
  type ChapterEntry,
} from "../../runtime/home.js";
import { ensureGitignoreEntry } from "../../runtime/gitignore.js";
import { initRole, type InitRoleOptions, type InitRoleDeps } from "./init-role.js";

/**
 * Generate a short unique session ID (8 hex characters).
 */
export function generateSessionId(): string {
  return crypto.randomBytes(4).toString("hex");
}

/**
 * Read and validate the run-init `.clawmasons/chapter.json` config
 * from the given project directory.
 *
 * @deprecated Kept for backward compatibility. `runAgent` now reads from
 * CLAWMASONS_HOME/chapters.json instead.
 */
export function readRunConfig(projectDir: string): RunConfig {
  const configPath = path.join(projectDir, ".clawmasons", "chapter.json");

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `No .clawmasons/chapter.json found. Run "chapter run-init" first to initialize the project.`,
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch {
    throw new Error(`.clawmasons/chapter.json is not valid JSON.`);
  }

  if (
    typeof raw !== "object" ||
    raw === null ||
    !("chapter" in raw) ||
    typeof (raw as RunConfig).chapter !== "string" ||
    !("docker-build" in raw) ||
    typeof (raw as RunConfig)["docker-build"] !== "string"
  ) {
    throw new Error(
      `.clawmasons/chapter.json must contain "chapter" and "docker-build" fields. Run "chapter run-init" to regenerate.`,
    );
  }

  return raw as RunConfig;
}

/**
 * Validate that the docker-build path has the expected Dockerfiles
 * for the given agent and role.
 */
export function validateDockerfiles(
  dockerBuildPath: string,
  agent: string,
  role: string,
): { proxyDockerfile: string; agentDockerfile: string; credentialServiceDockerfile: string } {
  const proxyDockerfile = path.join(dockerBuildPath, "proxy", role, "Dockerfile");
  const agentDockerfile = path.join(dockerBuildPath, "agent", agent, role, "Dockerfile");
  const credentialServiceDockerfile = path.join(dockerBuildPath, "credential-service", "Dockerfile");

  if (!fs.existsSync(proxyDockerfile)) {
    throw new Error(
      `Proxy Dockerfile not found: ${proxyDockerfile}\nRun "chapter build" in the chapter project to generate Dockerfiles.`,
    );
  }

  if (!fs.existsSync(agentDockerfile)) {
    throw new Error(
      `Agent Dockerfile not found: ${agentDockerfile}\nRun "chapter build" in the chapter project to generate Dockerfiles.`,
    );
  }

  if (!fs.existsSync(credentialServiceDockerfile)) {
    throw new Error(
      `Credential service Dockerfile not found: ${credentialServiceDockerfile}\nRun "chapter build" in the chapter project to generate Dockerfiles.`,
    );
  }

  return { proxyDockerfile, agentDockerfile, credentialServiceDockerfile };
}

/**
 * Resolve required credentials from an agent and role's apps.
 * Returns a map of credential key -> list of declaring package names.
 */
export function resolveRequiredCredentials(
  agentName: string,
  agentCredentials: string[],
  roleApps: Array<{ name: string; credentials: string[] }>,
): Map<string, string[]> {
  const credentialMap = new Map<string, string[]>();

  // Add agent-level credentials
  for (const key of agentCredentials) {
    const declarers = credentialMap.get(key) ?? [];
    declarers.push(agentName);
    credentialMap.set(key, declarers);
  }

  // Add app-level credentials
  for (const app of roleApps) {
    for (const key of app.credentials) {
      const declarers = credentialMap.get(key) ?? [];
      declarers.push(app.name);
      credentialMap.set(key, declarers);
    }
  }

  return credentialMap;
}

/**
 * Display required credentials and risk level to the operator.
 */
export function displayCredentials(
  credentials: Map<string, string[]>,
  riskLevel: string,
  roleName: string,
): void {
  console.log(`  Role: ${roleName} (${riskLevel} risk)`);
  console.log("");

  if (credentials.size === 0) {
    console.log("  No credentials required.");
    return;
  }

  console.log("  Required credentials:");
  for (const [key, declarers] of credentials) {
    const uniqueDeclarers = [...new Set(declarers)];
    console.log(`    ${key}  (declared by: ${uniqueDeclarers.join(", ")})`);
  }
}

/**
 * Generate a docker-compose.yml for a run-agent session.
 *
 * The compose file defines three services:
 * - proxy: built from the proxy Dockerfile, runs detached
 * - credential-service: built from the credential service Dockerfile, depends on proxy
 * - agent: built from the agent Dockerfile, runs interactively with stdin, depends on credential-service
 *
 * The project directory is bind-mounted into both proxy and agent containers at /workspace.
 * The agent container receives only MCP_PROXY_TOKEN — no API keys.
 */
export function generateComposeYml(opts: {
  dockerBuildPath: string;
  projectDir: string;
  agent: string;
  role: string;
  logsDir: string;
  proxyToken: string;
  credentialProxyToken: string;
}): string {
  const { dockerBuildPath, projectDir, agent, role, logsDir, proxyToken, credentialProxyToken } = opts;

  const proxyContext = path.join(dockerBuildPath);
  const proxyDockerfile = path.join("proxy", role, "Dockerfile");
  const agentContext = path.join(dockerBuildPath);
  const agentDockerfile = path.join("agent", agent, role, "Dockerfile");
  const credentialServiceDockerfile = path.join("credential-service", "Dockerfile");

  const proxyServiceName = `proxy-${role}`;
  const agentServiceName = `agent-${agent}-${role}`;

  // Use YAML template literal for clarity
  return `# Generated by chapter run-agent
services:
  ${proxyServiceName}:
    build:
      context: "${proxyContext}"
      dockerfile: "${proxyDockerfile}"
    volumes:
      - "${projectDir}:/workspace"
      - "${logsDir}:/logs"
    environment:
      - CHAPTER_PROXY_TOKEN=${proxyToken}
      - CREDENTIAL_PROXY_TOKEN=${credentialProxyToken}
    restart: "no"

  credential-service:
    build:
      context: "${proxyContext}"
      dockerfile: "${credentialServiceDockerfile}"
    environment:
      - CREDENTIAL_PROXY_TOKEN=${credentialProxyToken}
    depends_on:
      - ${proxyServiceName}
    restart: "no"

  ${agentServiceName}:
    build:
      context: "${agentContext}"
      dockerfile: "${agentDockerfile}"
    volumes:
      - "${projectDir}:/workspace"
    depends_on:
      - credential-service
    environment:
      - MCP_PROXY_TOKEN=${proxyToken}
    stdin_open: true
    tty: true
    init: true
    restart: "no"
`;
}

/**
 * Execute a docker compose command with the given compose file.
 * Returns a promise that resolves with the exit code.
 */
export function execComposeCommand(
  composeFile: string,
  args: string[],
  opts?: { interactive?: boolean },
): Promise<number> {
  const baseArgs = ["compose", "-f", composeFile, ...args];
  const stdio = opts?.interactive ? "inherit" as const : "ignore" as const;

  return new Promise((resolve) => {
    const child = spawn("docker", baseArgs, { stdio });
    child.on("close", (code) => resolve(code ?? 0));
    child.on("error", () => resolve(1));
  });
}

/**
 * Dependencies for run-agent, injectable for testing.
 */
export interface RunAgentDeps {
  /** Override the compose command executor (for testing). */
  execComposeFn?: (
    composeFile: string,
    args: string[],
    opts?: { interactive?: boolean },
  ) => Promise<number>;
  /** Override session ID generation (for testing). */
  generateSessionIdFn?: () => string;
  /** Override docker compose check (for testing). */
  checkDockerComposeFn?: () => void;
  /** Override CLAWMASONS_HOME resolution (for testing). */
  getClawmasonsHomeFn?: () => string;
  /** Override chapters.json role lookup (for testing). */
  findRoleEntryByRoleFn?: (
    home: string,
    role: string,
  ) => ChapterEntry | undefined;
  /** Override init-role invocation for auto-init (for testing). */
  initRoleFn?: (
    rootDir: string,
    options: InitRoleOptions,
    deps?: InitRoleDeps,
  ) => Promise<void>;
  /** Override .gitignore entry management (for testing). */
  ensureGitignoreEntryFn?: (dir: string, pattern: string) => boolean;
}

export function registerRunAgentCommand(program: Command): void {
  program
    .command("run-agent")
    .description("Run a chapter agent interactively against this project")
    .argument("<agent>", "Agent name (e.g., note-taker)")
    .argument("<role>", "Role name (e.g., writer)")
    .action(async (agent: string, role: string) => {
      await runAgent(process.cwd(), agent, role);
    });
}

export async function runAgent(
  projectDir: string,
  agent: string,
  role: string,
  deps?: RunAgentDeps,
): Promise<void> {
  const execCompose = deps?.execComposeFn ?? execComposeCommand;
  const genSessionId = deps?.generateSessionIdFn ?? generateSessionId;
  const checkDocker = deps?.checkDockerComposeFn ?? checkDockerCompose;
  const getHome = deps?.getClawmasonsHomeFn ?? getClawmasonsHome;
  const findRole = deps?.findRoleEntryByRoleFn ?? findRoleEntryByRole;
  const autoInitRole = deps?.initRoleFn ?? initRole;
  const ensureGitignore = deps?.ensureGitignoreEntryFn ?? ensureGitignoreEntry;

  try {
    // 1. Pre-flight: check docker compose is available
    checkDocker();

    // 2. Resolve role from CLAWMASONS_HOME/chapters.json
    const home = getHome();
    let entry = findRole(home, role);

    // 3. Auto-init if role not found
    if (!entry) {
      console.log(`\n  Role "${role}" not found in chapters.json. Auto-initializing...`);
      await autoInitRole(projectDir, { role });

      // Re-read after init
      entry = findRole(home, role);

      if (!entry) {
        throw new Error(
          `Role "${role}" not initialized and auto-init failed. Run "chapter init-role --role ${role}" from your chapter workspace.`,
        );
      }
    }

    const dockerBuildPath = entry.dockerBuild;
    const chapterName = `${entry.lodge}.${entry.chapter}`;

    console.log(`\n  Chapter: ${chapterName}`);
    console.log(`  Agent: ${agent}`);
    console.log(`  Role: ${role}`);

    // 4. Validate Dockerfiles exist
    validateDockerfiles(dockerBuildPath, agent, role);

    // 5. Ensure .clawmasons is in project's .gitignore
    ensureGitignore(projectDir, ".clawmasons");

    // 6. Generate session ID and create session directory
    const sessionId = genSessionId();
    const sessionDir = path.join(projectDir, ".clawmasons", "sessions", sessionId, "docker");
    fs.mkdirSync(sessionDir, { recursive: true });

    const logsDir = path.join(projectDir, ".clawmasons", "logs");
    fs.mkdirSync(logsDir, { recursive: true });

    console.log(`  Session: ${sessionId}`);

    // 7. Generate tokens and docker-compose.yml
    const proxyToken = crypto.randomBytes(32).toString("hex");
    const credentialProxyToken = crypto.randomBytes(32).toString("hex");

    const composeContent = generateComposeYml({
      dockerBuildPath,
      projectDir,
      agent,
      role,
      logsDir,
      proxyToken,
      credentialProxyToken,
    });

    const composeFile = path.join(sessionDir, "docker-compose.yml");
    fs.writeFileSync(composeFile, composeContent);
    console.log(`  Compose: .clawmasons/sessions/${sessionId}/docker/docker-compose.yml`);

    // 8. Start proxy detached
    const proxyServiceName = `proxy-${role}`;
    console.log(`\n  Starting proxy (${proxyServiceName})...`);

    const proxyCode = await execCompose(
      composeFile,
      ["up", "-d", proxyServiceName],
    );
    if (proxyCode !== 0) {
      throw new Error(`Failed to start proxy (exit code ${proxyCode}).`);
    }
    console.log(`  Proxy started in background.`);

    // 9. Start credential service detached
    console.log(`  Starting credential service...`);

    const credServiceCode = await execCompose(
      composeFile,
      ["up", "-d", "credential-service"],
    );
    if (credServiceCode !== 0) {
      throw new Error(`Failed to start credential service (exit code ${credServiceCode}).`);
    }
    console.log(`  Credential service started in background.`);

    // 10. Start agent interactively
    const agentServiceName = `agent-${agent}-${role}`;
    console.log(`  Starting agent (${agentServiceName})...\n`);

    const agentCode = await execCompose(
      composeFile,
      ["up", agentServiceName],
      { interactive: true },
    );

    // 11. Tear down all containers on agent exit
    console.log(`\n  Agent exited (code ${agentCode}). Tearing down services...`);

    await execCompose(composeFile, ["down"]);

    console.log(`  Services stopped.`);
    console.log(`  Session retained at: .clawmasons/sessions/${sessionId}/`);
    console.log(`\n  run-agent complete\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n  run-agent failed: ${message}\n`);
    process.exit(1);
  }
}
