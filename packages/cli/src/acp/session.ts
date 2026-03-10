/**
 * ACP Session — Docker Session Orchestration for ACP
 *
 * Manages Docker Compose sessions for ACP mode. Supports two modes:
 *
 * 1. Legacy (all-at-once): `start()` launches proxy + credential-service + agent
 *    together. Used when the bridge doesn't intercept session/new.
 *
 * 2. Split lifecycle: `startInfrastructure()` launches proxy + credential-service,
 *    then `startAgent(projectDir)` launches the agent per-session with a specific
 *    workspace mount. `stopAgent()` tears down only the agent. This supports
 *    CWD-aware ACP sessions where each session/new mounts a different directory.
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
  /** Path to agent session directory */
  sessionDir: string;
  /** Path to agent docker-compose.yml */
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

// ── Infrastructure Compose Generation ─────────────────────────────────

/**
 * Generate a docker-compose.yml for infrastructure services only
 * (proxy + credential-service). These are long-lived and shared
 * across agent sessions.
 */
export function generateInfraComposeYml(opts: {
  dockerBuildPath: string;
  role: string;
  logsDir: string;
  proxyToken: string;
  credentialProxyToken: string;
  credentials?: Record<string, string>;
  acpClient?: string;
}): string {
  const {
    dockerBuildPath,
    role,
    logsDir,
    proxyToken,
    credentialProxyToken,
    credentials,
    acpClient,
  } = opts;

  const proxyContext = dockerBuildPath;
  const proxyDockerfile = path.join("proxy", role, "Dockerfile");
  const credentialServiceDockerfile = path.join("credential-service", "Dockerfile");

  const proxyServiceName = `proxy-${role}`;

  // Build credential-service environment lines
  const credentialEnvLines = [`      - CREDENTIAL_PROXY_TOKEN=${credentialProxyToken}`];
  if (credentials && Object.keys(credentials).length > 0) {
    const overridesJson = JSON.stringify(credentials);
    credentialEnvLines.push(`      - CREDENTIAL_SESSION_OVERRIDES=${overridesJson}`);
  }

  // Build proxy environment lines
  const proxyEnvLines = [
    `      - CHAPTER_PROXY_TOKEN=${proxyToken}`,
    `      - CREDENTIAL_PROXY_TOKEN=${credentialProxyToken}`,
    `      - CHAPTER_SESSION_TYPE=acp`,
  ];
  if (acpClient) {
    proxyEnvLines.push(`      - CHAPTER_ACP_CLIENT=${acpClient}`);
  }

  return `# Generated by chapter acp-session (infrastructure)
services:
  ${proxyServiceName}:
    build:
      context: "${proxyContext}"
      dockerfile: "${proxyDockerfile}"
    volumes:
      - "${logsDir}:/logs"
    environment:
${proxyEnvLines.join("\n")}
    restart: "no"

  credential-service:
    build:
      context: "${proxyContext}"
      dockerfile: "${credentialServiceDockerfile}"
    environment:
${credentialEnvLines.join("\n")}
    depends_on:
      - ${proxyServiceName}
    restart: "no"
`;
}

/**
 * Generate a docker-compose.yml for an agent container only.
 * This is created per-session with the correct projectDir mount.
 */
export function generateAgentComposeYml(opts: {
  dockerBuildPath: string;
  projectDir: string;
  agent: string;
  role: string;
  proxyToken: string;
  acpPort: number;
  roleMounts?: RoleMount[];
}): string {
  const { dockerBuildPath, projectDir, agent, role, proxyToken, acpPort, roleMounts } = opts;

  const agentContext = dockerBuildPath;
  const agentDockerfile = path.join("agent", agent, role, "Dockerfile");
  const agentServiceName = `agent-${agent}-${role}`;

  // Build volume lines: workspace mount + role-declared mounts
  const volumeLines = [`      - "${projectDir}:/workspace"`];
  for (const vol of resolveRoleMountVolumes(roleMounts)) {
    volumeLines.push(`      - "${vol}"`);
  }

  return `# Generated by chapter acp-session (agent)
services:
  ${agentServiceName}:
    build:
      context: "${agentContext}"
      dockerfile: "${agentDockerfile}"
    volumes:
${volumeLines.join("\n")}
    environment:
      - MCP_PROXY_TOKEN=${proxyToken}
    ports:
      - "${acpPort}:${acpPort}"
    init: true
    restart: "no"
`;
}

// ── Legacy Compose Generation (backward compat) ──────────────────────

/**
 * Generate a docker-compose.yml for an ACP session (all services).
 * Kept for backward compatibility with the legacy start() method.
 */
export function generateAcpComposeYml(opts: {
  dockerBuildPath: string;
  projectDir: string;
  agent: string;
  role: string;
  logsDir: string;
  proxyToken: string;
  credentialProxyToken: string;
  acpPort: number;
  credentials?: Record<string, string>;
  acpClient?: string;
  roleMounts?: RoleMount[];
}): string {
  const {
    dockerBuildPath,
    projectDir,
    agent,
    role,
    logsDir,
    proxyToken,
    credentialProxyToken,
    acpPort,
    credentials,
    acpClient,
    roleMounts,
  } = opts;

  const proxyContext = dockerBuildPath;
  const proxyDockerfile = path.join("proxy", role, "Dockerfile");
  const agentContext = dockerBuildPath;
  const agentDockerfile = path.join("agent", agent, role, "Dockerfile");
  const credentialServiceDockerfile = path.join("credential-service", "Dockerfile");

  const proxyServiceName = `proxy-${role}`;
  const agentServiceName = `agent-${agent}-${role}`;

  // Build credential-service environment lines
  const credentialEnvLines = [`      - CREDENTIAL_PROXY_TOKEN=${credentialProxyToken}`];
  if (credentials && Object.keys(credentials).length > 0) {
    const overridesJson = JSON.stringify(credentials);
    credentialEnvLines.push(`      - CREDENTIAL_SESSION_OVERRIDES=${overridesJson}`);
  }

  // Build proxy environment lines (include ACP metadata)
  const proxyEnvLines = [
    `      - CHAPTER_PROXY_TOKEN=${proxyToken}`,
    `      - CREDENTIAL_PROXY_TOKEN=${credentialProxyToken}`,
    `      - CHAPTER_SESSION_TYPE=acp`,
  ];
  if (acpClient) {
    proxyEnvLines.push(`      - CHAPTER_ACP_CLIENT=${acpClient}`);
  }

  // Build agent volume lines: workspace mount + role-declared mounts
  const agentVolumeLines = [`      - "${projectDir}:/workspace"`];
  for (const vol of resolveRoleMountVolumes(roleMounts)) {
    agentVolumeLines.push(`      - "${vol}"`);
  }

  return `# Generated by chapter acp-session
services:
  ${proxyServiceName}:
    build:
      context: "${proxyContext}"
      dockerfile: "${proxyDockerfile}"
    volumes:
      - "${projectDir}:/workspace"
      - "${logsDir}:/logs"
    environment:
${proxyEnvLines.join("\n")}
    restart: "no"

  credential-service:
    build:
      context: "${proxyContext}"
      dockerfile: "${credentialServiceDockerfile}"
    environment:
${credentialEnvLines.join("\n")}
    depends_on:
      - ${proxyServiceName}
    restart: "no"

  ${agentServiceName}:
    build:
      context: "${agentContext}"
      dockerfile: "${agentDockerfile}"
    volumes:
${agentVolumeLines.join("\n")}
    depends_on:
      - credential-service
    environment:
      - MCP_PROXY_TOKEN=${proxyToken}
    ports:
      - "${acpPort}:${acpPort}"
    init: true
    restart: "no"
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
   *
   * Generates a docker-compose.yml and starts all three services in detached
   * mode. Returns session info including paths and port assignments.
   *
   * @throws If the session is already running, Docker is unavailable,
   *         Dockerfiles are missing, or compose up fails.
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
      projectDir,
      agent,
      role,
      logsDir,
      proxyToken,
      credentialProxyToken,
      acpPort,
      credentials: this.config.credentials,
      acpClient: this.config.acpClient,
    });

    const composeFile = path.join(sessionDir, "docker-compose.yml");
    fs.writeFileSync(composeFile, composeContent);

    // Start all services detached
    const exitCode = await this.deps.execComposeFn(composeFile, ["up", "-d"]);
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
   * Start infrastructure services only (proxy + credential-service).
   * These are long-lived and shared across agent sessions.
   *
   * @throws If infrastructure is already running, Docker is unavailable,
   *         or compose up fails.
   */
  async startInfrastructure(): Promise<InfrastructureInfo> {
    if (this.infraRunning) {
      throw new Error("Infrastructure is already running");
    }

    const { projectDir, agent, role } = this.config;

    // Pre-flight checks
    this.deps.checkDockerComposeFn();

    const runConfig = readRunConfig(projectDir);
    const dockerBuildPath = runConfig["docker-build"];
    validateDockerfiles(dockerBuildPath, agent, role);

    // Generate infrastructure session directory
    const sessionId = this.deps.generateSessionIdFn();
    const sessionDir = path.join(projectDir, ".clawmasons", "sessions", sessionId, "docker");
    fs.mkdirSync(sessionDir, { recursive: true });

    const logsDir = path.join(projectDir, ".clawmasons", "logs");
    fs.mkdirSync(logsDir, { recursive: true });

    // Generate tokens
    const proxyToken = crypto.randomBytes(32).toString("hex");
    const credentialProxyToken = crypto.randomBytes(32).toString("hex");

    // Generate infrastructure compose file
    const composeContent = generateInfraComposeYml({
      dockerBuildPath,
      role,
      logsDir,
      proxyToken,
      credentialProxyToken,
      credentials: this.config.credentials,
      acpClient: this.config.acpClient,
    });

    const composeFile = path.join(sessionDir, "docker-compose.yml");
    fs.writeFileSync(composeFile, composeContent);

    // Start infrastructure services
    const exitCode = await this.deps.execComposeFn(composeFile, ["up", "-d"]);
    if (exitCode !== 0) {
      throw new Error(`Failed to start infrastructure (docker compose exit code ${exitCode})`);
    }

    const proxyServiceName = `proxy-${role}`;

    this.infraInfo = {
      sessionId,
      sessionDir,
      composeFile,
      proxyServiceName,
      proxyToken,
      credentialProxyToken,
      dockerBuildPath,
    };

    this.infraRunning = true;
    return this.infraInfo;
  }

  /**
   * Start an agent container for a specific project directory.
   * Infrastructure must be running first (via `startInfrastructure()`).
   *
   * @param projectDir The project directory to mount as /workspace in the agent container.
   * @throws If infrastructure is not running, agent is already running, or compose up fails.
   */
  async startAgent(projectDir: string): Promise<AgentSessionInfo> {
    if (!this.infraRunning || !this.infraInfo) {
      throw new Error("Infrastructure must be running before starting an agent. Call startInfrastructure() first.");
    }

    if (this.agentRunning) {
      throw new Error("Agent is already running. Call stopAgent() first.");
    }

    const { agent, role } = this.config;
    const acpPort = this.config.acpPort ?? 3002;

    // Generate agent session directory
    const sessionId = this.deps.generateSessionIdFn();
    const sessionDir = path.join(projectDir, ".clawmasons", "sessions", sessionId, "docker");
    fs.mkdirSync(sessionDir, { recursive: true });

    // Generate agent compose file
    const composeContent = generateAgentComposeYml({
      dockerBuildPath: this.infraInfo.dockerBuildPath,
      projectDir,
      agent,
      role,
      proxyToken: this.infraInfo.proxyToken,
      acpPort,
    });

    const composeFile = path.join(sessionDir, "docker-compose.yml");
    fs.writeFileSync(composeFile, composeContent);

    // Start agent service
    const exitCode = await this.deps.execComposeFn(composeFile, ["up", "-d"]);
    if (exitCode !== 0) {
      throw new Error(`Failed to start agent (docker compose exit code ${exitCode})`);
    }

    const agentServiceName = `agent-${agent}-${role}`;

    this.agentInfo = {
      sessionId,
      sessionDir,
      composeFile,
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

    await this.deps.execComposeFn(this.agentInfo.composeFile, ["down"]);
    this.agentRunning = false;
    this.agentInfo = null;
  }

  /**
   * Stop the ACP Docker session (legacy mode).
   * Also stops infrastructure + agent if using split lifecycle.
   * Idempotent — calling stop when not running is a no-op.
   */
  async stop(): Promise<void> {
    // Stop agent first if split lifecycle
    if (this.agentRunning && this.agentInfo) {
      await this.deps.execComposeFn(this.agentInfo.composeFile, ["down"]);
      this.agentRunning = false;
      this.agentInfo = null;
    }

    // Stop infrastructure if split lifecycle
    if (this.infraRunning && this.infraInfo) {
      await this.deps.execComposeFn(this.infraInfo.composeFile, ["down"]);
      this.infraRunning = false;
      this.infraInfo = null;
    }

    // Stop legacy session
    if (this.running && this.sessionInfo) {
      await this.deps.execComposeFn(this.sessionInfo.composeFile, ["down"]);
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
