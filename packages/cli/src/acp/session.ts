/**
 * ACP Session — Docker Session Orchestration for ACP
 *
 * Manages Docker Compose sessions for ACP mode. All services (proxy,
 * agent) live in a single compose file so they share a Docker network.
 * The host proxy runs in-process on the host. The lifecycle is:
 *
 *   1. `startInfrastructure()` — `docker compose up -d` proxy
 *   2. `startAgentProcess(cwd)` — `docker compose run` (foreground, piped stdio)
 *      or `startAgent(cwd)` — `docker compose run -d` (legacy detached mode)
 *   3. `stopAgent()` — stops/kills the agent container
 *   4. `stop()` — `docker compose down` everything
 *
 * PRD refs: REQ-005 (Docker Session Lifecycle, ACP Session CWD Support)
 */

import * as crypto from "node:crypto";
import * as child_process from "node:child_process";
import type { ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { CLI_NAME_UPPERCASE } from "@clawmasons/shared";
import { checkDockerCompose } from "../cli/commands/docker-utils.js";
import { resolveRoleMountVolumes, type RoleMount } from "../generator/mount-volumes.js";
import type { AcpLogger } from "./logger.js";

// ── Local Utilities ──────────────────────────────────────────────────

/**
 * Generate a short random session identifier.
 */
function generateSessionId(): string {
  return crypto.randomBytes(4).toString("hex");
}

/**
 * Execute a `docker compose` command against a compose file.
 * Returns the exit code (0 = success).
 */
function execComposeCommand(
  composeFile: string,
  args: string[],
  opts?: { interactive?: boolean },
): Promise<number> {
  const baseArgs = ["compose", "-f", composeFile, ...args];
  const stdio = opts?.interactive ? "inherit" as const : "ignore" as const;

  return new Promise((resolve) => {
    const child = child_process.spawn("docker", baseArgs, { stdio });
    child.on("close", (code) => resolve(code ?? 0));
    child.on("error", () => resolve(1));
  });
}

// ── Constants ────────────────────────────────────────────────────────

const PROJECT_MOUNT_PATH = "/home/mason/workspace/project";

// ── Types ─────────────────────────────────────────────────────────────

export interface AcpSessionConfig {
  /** Workspace root directory */
  projectDir: string;
  /** Agent short name (e.g., "claude-code-agent") */
  agent: string;
  /** Role short name (e.g., "writer") */
  role: string;
  /** Internal proxy port (default: 3000) */
  proxyPort?: number;
  /** Session credential overrides extracted from ACP client mcpServers */
  credentials?: Record<string, string>;
  /** ACP client editor name (from ACP handshake, if available). */
  acpClient?: string;
  /** ACP command args appended to the agent entrypoint (e.g., ["--acp", "--port", "3002"]) */
  acpCommand?: string[];
  /** Declared credential keys for the agent (passed as AGENT_CREDENTIALS env var) */
  credentialKeys?: string[];
  /** Role-specific Docker build directory (e.g. {projectDir}/.mason/docker/{role-name}/) */
  dockerBuildDir: string;
  /** Shared Docker directory containing node_modules (e.g. {projectDir}/.mason/docker/) */
  dockerDir: string;
}

export interface SessionInfo {
  /** Unique session identifier */
  sessionId: string;
  /** Path to session directory */
  sessionDir: string;
  /** Path to generated docker-compose.yml */
  composeFile: string;
  /** Name of the proxy service in compose */
  proxyServiceName: string;
  /** Name of the agent service in compose */
  agentServiceName: string;
}

export interface InfrastructureInfo {
  /** Unique session identifier for infrastructure */
  sessionId: string;
  /** Path to infrastructure session directory */
  sessionDir: string;
  /** Path to infrastructure docker-compose.yml */
  composeFile: string;
  /** Name of the proxy service */
  proxyServiceName: string;
  /** Name of the agent service */
  agentServiceName: string;
  /** Generated proxy token (shared with agent sessions) */
  proxyToken: string;
  /** Generated credential proxy token (shared with agent sessions) */
  relayToken: string;
  /** Role-specific Docker build directory */
  dockerBuildDir: string;
}

export interface AgentSessionInfo {
  /** Unique agent session identifier */
  sessionId: string;
  /** Path to agent session directory (same compose file as infra) */
  sessionDir: string;
  /** Path to the shared docker-compose.yml */
  composeFile: string;
  /** Name of the agent service */
  agentServiceName: string;
  /** The project directory mounted into the container */
  projectDir: string;
}

/**
 * Dependencies for AcpSession, injectable for testing.
 */
export interface AcpSessionDeps {
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
  /** Override child_process.spawn (for testing startAgentProcess). */
  spawnFn?: (
    command: string,
    args: string[],
    options: child_process.SpawnOptions,
  ) => ChildProcess;
  /** Optional logger for diagnostics. */
  logger?: AcpLogger;
}

// ── Compose Generation ────────────────────────────────────────────────

/**
 * Generate a docker-compose.yml with proxy and agent services.
 * The host proxy runs in-process on the host, not in Docker.
 *
 * The agent service is defined with `profiles: ["agent"]` so that
 * `docker compose up -d` only starts the proxy.
 * The agent is started later via `docker compose run`.
 *
 * Docker build layout (project-local):
 *   .mason/docker/              ← dockerDir (shared, has node_modules)
 *     {role-name}/                   ← dockerBuildDir
 *       mcp-proxy/Dockerfile
 *       {agent-type}/Dockerfile
 */
export function generateAcpComposeYml(opts: {
  dockerBuildDir: string;
  dockerDir: string;
  projectDir?: string;
  agent: string;
  role: string;
  logsDir: string;
  proxyToken: string;
  relayToken: string;
  proxyPort?: number;
  acpClient?: string;
  acpCommand?: string[];
  roleMounts?: RoleMount[];
  credentialKeys?: string[];
}): string {
  const {
    dockerBuildDir,
    dockerDir,
    projectDir,
    agent,
    role,
    logsDir,
    proxyToken,
    relayToken,
    proxyPort,
    acpClient,
    acpCommand,
    roleMounts,
    credentialKeys,
  } = opts;

  // Proxy: context is the shared dockerDir (has node_modules),
  // dockerfile is the role-specific mcp-proxy/Dockerfile.
  const proxyDockerfile = path.relative(dockerDir, path.join(dockerBuildDir, "mcp-proxy", "Dockerfile"));

  // Agent: context is the shared dockerDir (has node_modules),
  // dockerfile is the role-specific {agent-type}/Dockerfile.
  const agentDockerfile = path.relative(dockerDir, path.join(dockerBuildDir, agent, "Dockerfile"));

  const proxyServiceName = `proxy-${role}`;
  const agentServiceName = `agent-${role}`;

  // Build proxy environment lines (include ACP metadata)
  const proxyEnvLines = [
    `      - ${CLI_NAME_UPPERCASE}_PROXY_TOKEN=${proxyToken}`,
    `      - RELAY_TOKEN=${relayToken}`,
    `      - ${CLI_NAME_UPPERCASE}_SESSION_TYPE=acp`,
    `      - PROJECT_DIR=${PROJECT_MOUNT_PATH}`,
  ];
  if (acpClient) {
    proxyEnvLines.push(`      - ${CLI_NAME_UPPERCASE}_ACP_CLIENT=${acpClient}`);
  }
  if (credentialKeys && credentialKeys.length > 0) {
    proxyEnvLines.push(`      - ${CLI_NAME_UPPERCASE}_DECLARED_CREDENTIALS=${JSON.stringify(credentialKeys)}`);
  }

  // Build proxy ports (expose to host for in-process host proxy relay connection)
  const proxyPortsSection = proxyPort
    ? `\n    ports:\n      - "${proxyPort}:9090"`
    : "";

  // Build agent environment lines
  const agentEnvLines = [
    `      - MCP_PROXY_TOKEN=${proxyToken}`,
    `      - MCP_PROXY_URL=http://${proxyServiceName}:9090`,
  ];
  if (credentialKeys && credentialKeys.length > 0) {
    agentEnvLines.push(`      - AGENT_CREDENTIALS=${JSON.stringify(credentialKeys)}`);
  }

  // Build agent volume lines
  const agentVolumeLines: string[] = [];

  // Workspace mount — provides agent-launch.json at /home/mason/workspace/agent-launch.json
  const workspacePath = path.join(dockerBuildDir, agent, "workspace");
  agentVolumeLines.push(`      - "${workspacePath}:/home/mason/workspace"`);

  // Per-file overlay mounts — inject config files into /home/mason/workspace/project/
  const buildWorkspaceProjectDir = path.join(dockerBuildDir, agent, "build", "workspace", "project");
  if (fs.existsSync(buildWorkspaceProjectDir)) {
    for (const entry of fs.readdirSync(buildWorkspaceProjectDir)) {
      agentVolumeLines.push(`      - "${path.join(buildWorkspaceProjectDir, entry)}:/home/mason/workspace/project/${entry}"`);
    }
  }

  for (const vol of resolveRoleMountVolumes(roleMounts)) {
    agentVolumeLines.push(`      - "${vol}"`);
  }
  const agentVolumesSection = agentVolumeLines.length > 0
    ? `\n    volumes:\n${agentVolumeLines.join("\n")}`
    : "";

  // Build command line (overrides Dockerfile CMD / appends to ENTRYPOINT)
  const commandLine = acpCommand
    ? `\n    command: ${JSON.stringify(acpCommand)}`
    : "";

  // Build proxy volume lines
  const cacheDir = path.join(dockerBuildDir, "mcp-proxy", ".cache");
  const proxyVolumeLines = [`      - "${logsDir}:/logs"`];
  if (projectDir) {
    proxyVolumeLines.push(`      - "${projectDir}:${PROJECT_MOUNT_PATH}"`);
  }
  proxyVolumeLines.push(`      - "${cacheDir}:/app/.cache"`);

  // Unique compose project name derived from project or build directory
  const nameSource = projectDir ?? dockerBuildDir;
  const projectHash = crypto.createHash("sha256").update(nameSource).digest("hex").slice(0, 8);
  const composeName = `mason-${projectHash}`;

  return `# Generated by mason acp-session
name: ${composeName}
services:
  ${proxyServiceName}:
    build:
      context: "${dockerDir}"
      dockerfile: "${proxyDockerfile}"
    volumes:
${proxyVolumeLines.join("\n")}
    environment:
${proxyEnvLines.join("\n")}${proxyPortsSection}
    restart: "no"
    init: true

  ${agentServiceName}:
    build:
      context: "${dockerDir}"
      dockerfile: "${agentDockerfile}"${agentVolumesSection}
    depends_on:
      - ${proxyServiceName}
    environment:
${agentEnvLines.join("\n")}${commandLine}
    init: true
    restart: "no"
    profiles:
      - agent
`;
}

// ── AcpSession ────────────────────────────────────────────────────────

export class AcpSession {
  private readonly config: AcpSessionConfig;
  private readonly deps: Required<AcpSessionDeps>;
  private running = false;
  private sessionInfo: SessionInfo | null = null;

  // Split lifecycle state
  private infraInfo: InfrastructureInfo | null = null;
  private infraRunning = false;
  private agentInfo: AgentSessionInfo | null = null;
  private agentRunning = false;
  private agentChild: ChildProcess | null = null;

  constructor(config: AcpSessionConfig, deps?: AcpSessionDeps) {
    this.config = config;
    const noopLogger: AcpLogger = { log() {}, error() {}, close() {} };
    this.deps = {
      execComposeFn: deps?.execComposeFn ?? execComposeCommand,
      generateSessionIdFn: deps?.generateSessionIdFn ?? generateSessionId,
      checkDockerComposeFn: deps?.checkDockerComposeFn ?? checkDockerCompose,
      spawnFn: deps?.spawnFn ?? child_process.spawn,
      logger: deps?.logger ?? noopLogger,
    };
  }

  /**
   * Start the ACP Docker session (legacy all-at-once mode).
   * Starts all services including the agent in a single compose up.
   */
  async start(): Promise<SessionInfo> {
    if (this.running) {
      throw new Error("ACP session is already running");
    }

    const { projectDir, agent, role, dockerBuildDir, dockerDir } = this.config;

    // Pre-flight checks
    this.deps.checkDockerComposeFn();

    // Generate session directory
    const sessionId = this.deps.generateSessionIdFn();
    const sessionDir = path.join(projectDir, ".mason", "sessions", sessionId, "docker");
    fs.mkdirSync(sessionDir, { recursive: true });

    const logsDir = path.join(sessionDir, "logs");
    fs.mkdirSync(logsDir, { recursive: true });

    // Generate tokens
    const proxyToken = crypto.randomBytes(32).toString("hex");
    const relayToken = crypto.randomBytes(32).toString("hex");

    // Generate compose file
    const composeContent = generateAcpComposeYml({
      dockerBuildDir,
      dockerDir,
      projectDir,
      agent,
      role,
      logsDir,
      proxyToken,
      relayToken,
      proxyPort: this.config.proxyPort,
      acpClient: this.config.acpClient,
      acpCommand: this.config.acpCommand,
      credentialKeys: this.config.credentialKeys,
    });

    const composeFile = path.join(sessionDir, "docker-compose.yml");
    fs.writeFileSync(composeFile, composeContent);

    // Start all services including agent profile
    const exitCode = await this.deps.execComposeFn(composeFile, ["--profile", "agent", "up", "-d"]);
    if (exitCode !== 0) {
      throw new Error(`Failed to start ACP session (docker compose exit code ${exitCode})`);
    }

    const proxyServiceName = `proxy-${role}`;
    const agentServiceName = `agent-${role}`;

    this.sessionInfo = {
      sessionId,
      sessionDir,
      composeFile,
      proxyServiceName,
      agentServiceName,
    };

    this.running = true;
    return this.sessionInfo;
  }

  /**
   * Start infrastructure services only (proxy).
   * These are long-lived and shared across agent sessions.
   * The agent service is in the same compose file but behind a profile,
   * so `up -d` skips it.
   */
  async startInfrastructure(): Promise<InfrastructureInfo> {
    if (this.infraRunning) {
      throw new Error("Infrastructure is already running");
    }

    const { projectDir, agent, role, dockerBuildDir, dockerDir } = this.config;

    // Pre-flight checks
    this.deps.checkDockerComposeFn();

    // Generate session directory
    const sessionId = this.deps.generateSessionIdFn();
    const sessionDir = path.join(projectDir, ".mason", "sessions", sessionId, "docker");
    fs.mkdirSync(sessionDir, { recursive: true });

    const logsDir = path.join(sessionDir, "logs");
    fs.mkdirSync(logsDir, { recursive: true });

    // Generate tokens
    const proxyToken = crypto.randomBytes(32).toString("hex");
    const relayToken = crypto.randomBytes(32).toString("hex");

    // Generate single compose file with all services
    const composeContent = generateAcpComposeYml({
      dockerBuildDir,
      dockerDir,
      projectDir,
      agent,
      role,
      logsDir,
      proxyToken,
      relayToken,
      proxyPort: this.config.proxyPort,
      acpClient: this.config.acpClient,
      acpCommand: this.config.acpCommand,
      credentialKeys: this.config.credentialKeys,
    });

    const composeFile = path.join(sessionDir, "docker-compose.yml");
    fs.writeFileSync(composeFile, composeContent);

    // Start only infra services (agent is behind "agent" profile, skipped)
    this.deps.logger.log(`[session] docker compose -f ${composeFile} up -d`);
    const exitCode = await this.deps.execComposeFn(composeFile, ["up", "-d"]);
    this.deps.logger.log(`[session] docker compose up exit code: ${exitCode}`);
    if (exitCode !== 0) {
      throw new Error(`Failed to start infrastructure (docker compose exit code ${exitCode})`);
    }

    const proxyServiceName = `proxy-${role}`;
    const agentServiceName = `agent-${role}`;

    this.infraInfo = {
      sessionId,
      sessionDir,
      composeFile,
      proxyServiceName,
      agentServiceName,
      proxyToken,
      relayToken,
      dockerBuildDir,
    };

    this.infraRunning = true;
    return this.infraInfo;
  }

  /**
   * Start an agent container for a specific project directory.
   * Uses `docker compose run -d` on the agent service from the
   * same compose file, so it shares the network with infra.
   *
   * @param projectDir The project directory to mount into the container.
   */
  async startAgent(projectDir: string): Promise<AgentSessionInfo> {
    if (!this.infraRunning || !this.infraInfo) {
      throw new Error("Infrastructure must be running before starting an agent. Call startInfrastructure() first.");
    }

    if (this.agentRunning) {
      throw new Error("Agent is already running. Call stopAgent() first.");
    }

    const agentServiceName = this.infraInfo.agentServiceName;

    // Use docker compose run with a volume override for this session's CWD
    const runArgs = ["run", "-d", "--rm", "--build", "-v", `${projectDir}:${PROJECT_MOUNT_PATH}`, agentServiceName];
    this.deps.logger.log(`[session] docker compose -f ${this.infraInfo.composeFile} ${runArgs.join(" ")}`);
    const exitCode = await this.deps.execComposeFn(
      this.infraInfo.composeFile,
      runArgs,
    );
    this.deps.logger.log(`[session] docker compose run exit code: ${exitCode}`);
    if (exitCode !== 0) {
      throw new Error(`Failed to start agent (docker compose exit code ${exitCode})`);
    }

    this.agentInfo = {
      sessionId: this.infraInfo.sessionId,
      sessionDir: this.infraInfo.sessionDir,
      composeFile: this.infraInfo.composeFile,
      agentServiceName,
      projectDir,
    };

    this.agentRunning = true;
    return this.agentInfo;
  }

  /**
   * Start an agent container as a foreground child process with piped stdio.
   *
   * Unlike `startAgent()` (which uses `docker compose run -d`), this method
   * spawns `docker compose run` without `-d` so the child process's
   * stdin/stdout can be wrapped with `ndJsonStream()` for direct ACP
   * communication. No port mapping or container ID discovery is needed.
   *
   * @param projectDir The project directory to mount into the container.
   * @returns The spawned child process and agent session info.
   */
  async startAgentProcess(projectDir: string): Promise<{ child: ChildProcess; agentInfo: AgentSessionInfo }> {
    if (!this.infraRunning || !this.infraInfo) {
      throw new Error("Infrastructure must be running before starting an agent. Call startInfrastructure() first.");
    }

    if (this.agentRunning) {
      throw new Error("Agent is already running. Call stopAgent() first.");
    }

    const agentServiceName = this.infraInfo.agentServiceName;

    // Pre-build the agent image so build output goes to the logger,
    // not into the piped ndjson stream used for ACP protocol messages.
    this.deps.logger.log(`[session] docker compose -f ${this.infraInfo.composeFile} build ${agentServiceName}`);
    const buildExitCode = await this.deps.execComposeFn(
      this.infraInfo.composeFile,
      ["build", agentServiceName],
    );
    if (buildExitCode !== 0) {
      throw new Error(`Failed to build agent image (docker compose build exit code ${buildExitCode})`);
    }

    // Spawn docker compose run as a foreground process with piped stdio.
    // No -d flag, no --build: the child process IS the transport.
    const composeArgs = [
      "compose", "-f", this.infraInfo.composeFile,
      "run", "--rm",
      "-v", `${projectDir}:${PROJECT_MOUNT_PATH}`,
      agentServiceName,
    ];

    this.deps.logger.log(`[session] docker ${composeArgs.join(" ")}`);

    const child = this.deps.spawnFn("docker", composeArgs, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.agentInfo = {
      sessionId: this.infraInfo.sessionId,
      sessionDir: this.infraInfo.sessionDir,
      composeFile: this.infraInfo.composeFile,
      agentServiceName,
      projectDir,
    };

    this.agentChild = child;
    this.agentRunning = true;

    return { child, agentInfo: this.agentInfo };
  }

  /**
   * Stop only the agent container. Infrastructure remains running.
   * Idempotent — calling when agent is not running is a no-op.
   *
   * If a child process exists (from `startAgentProcess()`), it is killed.
   * Otherwise, the agent service is stopped via compose commands.
   */
  async stopAgent(): Promise<void> {
    if (!this.agentRunning || !this.agentInfo) {
      return;
    }

    // If we have a child process (from startAgentProcess), kill it
    if (this.agentChild) {
      this.deps.logger.log(`[session] Killing agent child process`);
      this.agentChild.kill();
      this.agentChild = null;
    } else {
      // Legacy path: stop via compose commands (from startAgent)
      this.deps.logger.log(`[session] Stopping agent service ${this.agentInfo.agentServiceName}`);
      await this.deps.execComposeFn(
        this.agentInfo.composeFile,
        ["--profile", "agent", "stop", this.agentInfo.agentServiceName],
      );
      await this.deps.execComposeFn(
        this.agentInfo.composeFile,
        ["--profile", "agent", "rm", "-f", this.agentInfo.agentServiceName],
      );
    }
    this.deps.logger.log("[session] Agent stopped and removed");

    this.agentRunning = false;
    this.agentInfo = null;
  }

  /**
   * Stop all services (infrastructure + agent).
   * Idempotent — calling stop when not running is a no-op.
   */
  async stop(): Promise<void> {
    // Kill child process if one exists (from startAgentProcess)
    if (this.agentChild) {
      this.agentChild.kill();
      this.agentChild = null;
    }

    // Stop infrastructure + agent via compose down
    if (this.infraRunning && this.infraInfo) {
      await this.deps.execComposeFn(this.infraInfo.composeFile, ["--profile", "agent", "down"]);
      this.infraRunning = false;
      this.infraInfo = null;
      this.agentRunning = false;
      this.agentInfo = null;
    }

    // Stop legacy session
    if (this.running && this.sessionInfo) {
      await this.deps.execComposeFn(this.sessionInfo.composeFile, ["--profile", "agent", "down"]);
      this.running = false;
    }
  }

  /**
   * Check if the session is currently running (legacy mode).
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Check if infrastructure is currently running.
   */
  isInfrastructureRunning(): boolean {
    return this.infraRunning;
  }

  /**
   * Check if an agent is currently running.
   */
  isAgentRunning(): boolean {
    return this.agentRunning;
  }
}
