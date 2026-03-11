/**
 * ACP Session — Docker Session Orchestration for ACP
 *
 * Manages Docker Compose sessions for ACP mode. All services (proxy,
 * agent) live in a single compose file so they share a Docker network.
 * The credential service runs in-process on the host. The lifecycle is:
 *
 *   1. `startInfrastructure()` — `docker compose up -d` proxy
 *   2. `startAgent(cwd)` — `docker compose run -d` the agent with /workspace mount
 *   3. `stopAgent()` — stops only the agent container
 *   4. `stop()` — `docker compose down` everything
 *
 * PRD refs: REQ-005 (Docker Session Lifecycle, ACP Session CWD Support)
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  readRunConfig,
  validateDockerfiles,
  execComposeCommand,
  generateSessionId,
} from "../cli/commands/run-agent.js";
import { checkDockerCompose } from "../cli/commands/docker-utils.js";
import { resolveRoleMountVolumes, type RoleMount } from "../generator/mount-volumes.js";

// ── Types ─────────────────────────────────────────────────────────────

export interface AcpSessionConfig {
  /** Workspace root directory (chapter workspace, for readRunConfig) */
  projectDir: string;
  /** Agent short name (e.g., "note-taker") */
  agent: string;
  /** Role short name (e.g., "writer") */
  role: string;
  /** ACP agent port inside the container (default: 3002) */
  acpPort?: number;
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
}

export interface SessionInfo {
  /** Unique session identifier */
  sessionId: string;
  /** Path to session directory */
  sessionDir: string;
  /** Path to generated docker-compose.yml */
  composeFile: string;
  /** ACP port exposed on the host */
  acpPort: number;
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
  credentialProxyToken: string;
  /** Docker build path resolved from chapter workspace */
  dockerBuildPath: string;
}

export interface AgentSessionInfo {
  /** Unique agent session identifier */
  sessionId: string;
  /** Path to agent session directory (same compose file as infra) */
  sessionDir: string;
  /** Path to the shared docker-compose.yml */
  composeFile: string;
  /** ACP port exposed on the host */
  acpPort: number;
  /** Name of the agent service */
  agentServiceName: string;
  /** The project directory mounted as /workspace */
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
}

// ── Compose Generation ────────────────────────────────────────────────

/**
 * Generate a docker-compose.yml with proxy and agent services.
 * The credential service runs in-process on the host, not in Docker.
 *
 * The agent service is defined with `profiles: ["agent"]` so that
 * `docker compose up -d` only starts the proxy.
 * The agent is started later via `docker compose run`.
 */
export function generateAcpComposeYml(opts: {
  dockerBuildPath: string;
  agent: string;
  role: string;
  logsDir: string;
  proxyToken: string;
  credentialProxyToken: string;
  acpPort: number;
  proxyPort?: number;
  acpClient?: string;
  acpCommand?: string[];
  roleMounts?: RoleMount[];
  credentialKeys?: string[];
}): string {
  const {
    dockerBuildPath,
    agent,
    role,
    logsDir,
    proxyToken,
    credentialProxyToken,
    acpPort,
    proxyPort,
    acpClient,
    acpCommand,
    roleMounts,
    credentialKeys,
  } = opts;

  const proxyDockerfile = path.join("proxy", role, "Dockerfile");
  const agentDockerfile = path.join("agent", agent, role, "Dockerfile");

  const proxyServiceName = `proxy-${role}`;
  const agentServiceName = `agent-${agent}-${role}`;

  // Build proxy environment lines (include ACP metadata)
  const proxyEnvLines = [
    `      - CHAPTER_PROXY_TOKEN=${proxyToken}`,
    `      - CREDENTIAL_PROXY_TOKEN=${credentialProxyToken}`,
    `      - CHAPTER_SESSION_TYPE=acp`,
  ];
  if (acpClient) {
    proxyEnvLines.push(`      - CHAPTER_ACP_CLIENT=${acpClient}`);
  }
  if (credentialKeys && credentialKeys.length > 0) {
    proxyEnvLines.push(`      - CHAPTER_DECLARED_CREDENTIALS=${JSON.stringify(credentialKeys)}`);
  }

  // Build proxy ports (expose to host for in-process credential service WSClient)
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

  // Build agent volume lines (workspace gets overridden at run time)
  const agentVolumeLines: string[] = [];
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

  return `# Generated by chapter acp-session
services:
  ${proxyServiceName}:
    build:
      context: "${dockerBuildPath}"
      dockerfile: "${proxyDockerfile}"
    volumes:
      - "${logsDir}:/logs"
    environment:
${proxyEnvLines.join("\n")}${proxyPortsSection}
    restart: "no"

  ${agentServiceName}:
    build:
      context: "${dockerBuildPath}"
      dockerfile: "${agentDockerfile}"${agentVolumesSection}
    depends_on:
      - ${proxyServiceName}
    environment:
${agentEnvLines.join("\n")}
    ports:
      - "${acpPort}:${acpPort}"${commandLine}
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

  constructor(config: AcpSessionConfig, deps?: AcpSessionDeps) {
    this.config = config;
    this.deps = {
      execComposeFn: deps?.execComposeFn ?? execComposeCommand,
      generateSessionIdFn: deps?.generateSessionIdFn ?? generateSessionId,
      checkDockerComposeFn: deps?.checkDockerComposeFn ?? checkDockerCompose,
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

    const { projectDir, agent, role } = this.config;
    const acpPort = this.config.acpPort ?? 3002;

    // Pre-flight checks
    this.deps.checkDockerComposeFn();

    const runConfig = readRunConfig(projectDir);
    const dockerBuildPath = runConfig["docker-build"];
    validateDockerfiles(dockerBuildPath, agent, role);

    // Generate session directory
    const sessionId = this.deps.generateSessionIdFn();
    const sessionDir = path.join(projectDir, ".clawmasons", "sessions", sessionId, "docker");
    fs.mkdirSync(sessionDir, { recursive: true });

    const logsDir = path.join(projectDir, ".clawmasons", "logs");
    fs.mkdirSync(logsDir, { recursive: true });

    // Generate tokens
    const proxyToken = crypto.randomBytes(32).toString("hex");
    const credentialProxyToken = crypto.randomBytes(32).toString("hex");

    // Generate compose file
    const composeContent = generateAcpComposeYml({
      dockerBuildPath,
      agent,
      role,
      logsDir,
      proxyToken,
      credentialProxyToken,
      acpPort,
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
    const agentServiceName = `agent-${agent}-${role}`;

    this.sessionInfo = {
      sessionId,
      sessionDir,
      composeFile,
      acpPort,
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

    const { projectDir, agent, role } = this.config;
    const acpPort = this.config.acpPort ?? 3002;

    // Pre-flight checks
    this.deps.checkDockerComposeFn();

    const runConfig = readRunConfig(projectDir);
    const dockerBuildPath = runConfig["docker-build"];
    validateDockerfiles(dockerBuildPath, agent, role);

    // Generate session directory
    const sessionId = this.deps.generateSessionIdFn();
    const sessionDir = path.join(projectDir, ".clawmasons", "sessions", sessionId, "docker");
    fs.mkdirSync(sessionDir, { recursive: true });

    const logsDir = path.join(projectDir, ".clawmasons", "logs");
    fs.mkdirSync(logsDir, { recursive: true });

    // Generate tokens
    const proxyToken = crypto.randomBytes(32).toString("hex");
    const credentialProxyToken = crypto.randomBytes(32).toString("hex");

    // Generate single compose file with all services
    const composeContent = generateAcpComposeYml({
      dockerBuildPath,
      agent,
      role,
      logsDir,
      proxyToken,
      credentialProxyToken,
      acpPort,
      proxyPort: this.config.proxyPort,
      acpClient: this.config.acpClient,
      acpCommand: this.config.acpCommand,
      credentialKeys: this.config.credentialKeys,
    });

    const composeFile = path.join(sessionDir, "docker-compose.yml");
    fs.writeFileSync(composeFile, composeContent);

    // Start only infra services (agent is behind "agent" profile, skipped)
    const exitCode = await this.deps.execComposeFn(composeFile, ["up", "-d"]);
    if (exitCode !== 0) {
      throw new Error(`Failed to start infrastructure (docker compose exit code ${exitCode})`);
    }

    const proxyServiceName = `proxy-${role}`;
    const agentServiceName = `agent-${agent}-${role}`;

    this.infraInfo = {
      sessionId,
      sessionDir,
      composeFile,
      proxyServiceName,
      agentServiceName,
      proxyToken,
      credentialProxyToken,
      dockerBuildPath,
    };

    this.infraRunning = true;
    return this.infraInfo;
  }

  /**
   * Start an agent container for a specific project directory.
   * Uses `docker compose run -d` on the agent service from the
   * same compose file, so it shares the network with infra.
   *
   * @param projectDir The project directory to mount as /workspace.
   */
  async startAgent(projectDir: string): Promise<AgentSessionInfo> {
    if (!this.infraRunning || !this.infraInfo) {
      throw new Error("Infrastructure must be running before starting an agent. Call startInfrastructure() first.");
    }

    if (this.agentRunning) {
      throw new Error("Agent is already running. Call stopAgent() first.");
    }

    const acpPort = this.config.acpPort ?? 3002;
    const agentServiceName = this.infraInfo.agentServiceName;

    // Use docker compose run with a volume override for this session's CWD
    const exitCode = await this.deps.execComposeFn(
      this.infraInfo.composeFile,
      ["run", "-d", "--rm", "--build", "--service-ports", "-v", `${projectDir}:/workspace`, agentServiceName],
    );
    if (exitCode !== 0) {
      throw new Error(`Failed to start agent (docker compose exit code ${exitCode})`);
    }

    this.agentInfo = {
      sessionId: this.infraInfo.sessionId,
      sessionDir: this.infraInfo.sessionDir,
      composeFile: this.infraInfo.composeFile,
      acpPort,
      agentServiceName,
      projectDir,
    };

    this.agentRunning = true;
    return this.agentInfo;
  }

  /**
   * Stop only the agent container. Infrastructure remains running.
   * Idempotent — calling when agent is not running is a no-op.
   */
  async stopAgent(): Promise<void> {
    if (!this.agentRunning || !this.agentInfo) {
      return;
    }

    // Stop and remove the agent service only
    await this.deps.execComposeFn(
      this.agentInfo.composeFile,
      ["--profile", "agent", "stop", this.agentInfo.agentServiceName],
    );
    await this.deps.execComposeFn(
      this.agentInfo.composeFile,
      ["--profile", "agent", "rm", "-f", this.agentInfo.agentServiceName],
    );

    this.agentRunning = false;
    this.agentInfo = null;
  }

  /**
   * Stop all services (infrastructure + agent).
   * Idempotent — calling stop when not running is a no-op.
   */
  async stop(): Promise<void> {
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
