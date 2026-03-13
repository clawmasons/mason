/**
 * Role-centric Docker build directory and session generation.
 *
 * Generates:
 * 1. Docker build directories at `.clawmasons/docker/<role-name>/` (PRD §7.1)
 * 2. Volume masking for container.ignore.paths (PRD §7.3)
 * 3. Sentinel empty file for file-level volume masking
 * 4. Session directories with self-contained compose files (PRD §7.5)
 *
 * @module docker-generator
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { RoleType } from "@clawmasons/shared";
import { getAppShortName } from "@clawmasons/shared";
import { materializeForAgent } from "./role-materializer.js";
import { generateAgentDockerfile } from "../generator/agent-dockerfile.js";
import { generateProxyDockerfile } from "../generator/proxy-dockerfile.js";
import { adaptRoleToResolvedAgent } from "@clawmasons/shared";
import { resolveRoleMountVolumes, type RoleMount } from "../generator/mount-volumes.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Path to sentinel empty file relative to project root. */
const SENTINEL_RELATIVE_PATH = ".clawmasons/empty-file";

/** Container path where the project is mounted read-only. */
const PROJECT_MOUNT_PATH = "/home/mason/workspace/project";

// ---------------------------------------------------------------------------
// Volume Masking Types
// ---------------------------------------------------------------------------

export interface VolumeMaskEntry {
  /** Whether this mask targets a directory or a file. */
  type: "directory" | "file";
  /** The original path from container.ignore.paths. */
  hostPath: string;
  /** The container path (under project mount). */
  containerPath: string;
  /** Named volume name for directory masks. */
  volumeName?: string;
}

// ---------------------------------------------------------------------------
// Volume Masking
// ---------------------------------------------------------------------------

/**
 * Sanitize a path into a valid Docker volume name.
 *
 * Replaces non-alphanumeric characters with hyphens, strips leading/trailing
 * hyphens, and prefixes with "ignore-".
 */
export function sanitizeVolumeName(ignorePath: string): string {
  const cleaned = ignorePath
    .replace(/[/\\]/g, "-")
    .replace(/\./g, "")
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `ignore-${cleaned}`;
}

/**
 * Classify ignore paths and generate volume mask entries.
 *
 * - Paths ending with `/` are classified as directories (masked with named empty volumes).
 * - Paths without trailing `/` are classified as files (masked with bind mount of sentinel file).
 *
 * All container paths target the project mount at `/home/mason/workspace/project/`.
 *
 * @param ignorePaths - Array of paths from container.ignore.paths
 * @returns Array of VolumeMaskEntry objects
 */
export function generateVolumeMasks(ignorePaths: string[]): VolumeMaskEntry[] {
  return ignorePaths.map((p) => {
    const isDirectory = p.endsWith("/");
    const cleanPath = p.replace(/\/+$/, ""); // strip trailing slash for path building
    const containerPath = `${PROJECT_MOUNT_PATH}/${cleanPath}`;

    if (isDirectory) {
      return {
        type: "directory" as const,
        hostPath: p,
        containerPath,
        volumeName: sanitizeVolumeName(cleanPath),
      };
    } else {
      return {
        type: "file" as const,
        hostPath: p,
        containerPath,
      };
    }
  });
}

// ---------------------------------------------------------------------------
// Sentinel File
// ---------------------------------------------------------------------------

/**
 * Ensure the sentinel empty file exists at `.clawmasons/empty-file`.
 *
 * The file is 0 bytes with permissions `0o444` (read-only for all).
 * Idempotent — does nothing if the file already exists.
 *
 * @param projectDir - Absolute path to the project root
 * @returns Absolute path to the sentinel file
 */
export function ensureSentinelFile(
  projectDir: string,
  fsDeps?: {
    existsSync?: (p: string) => boolean;
    mkdirSync?: (p: string, opts?: { recursive?: boolean }) => void;
    writeFileSync?: (p: string, data: string, opts?: { mode?: number }) => void;
    chmodSync?: (p: string, mode: number) => void;
  },
): string {
  const deps = {
    existsSync: fsDeps?.existsSync ?? fs.existsSync,
    mkdirSync: fsDeps?.mkdirSync ?? fs.mkdirSync,
    writeFileSync: fsDeps?.writeFileSync ?? fs.writeFileSync,
    chmodSync: fsDeps?.chmodSync ?? fs.chmodSync,
  };

  const sentinelPath = path.join(projectDir, SENTINEL_RELATIVE_PATH);

  if (!deps.existsSync(sentinelPath)) {
    deps.mkdirSync(path.dirname(sentinelPath), { recursive: true });
    deps.writeFileSync(sentinelPath, "", { mode: 0o444 });
    deps.chmodSync(sentinelPath, 0o444);
  }

  return sentinelPath;
}

// ---------------------------------------------------------------------------
// Docker Build Directory Generation
// ---------------------------------------------------------------------------

export interface GenerateBuildDirOptions {
  /** The resolved RoleType to generate for. */
  role: RoleType;
  /** Target agent type (e.g., "claude-code"). */
  agentType: string;
  /** Absolute path to the project root. */
  projectDir: string;
  /** Root of docker build output (defaults to `<projectDir>/.clawmasons/docker`). */
  dockerBuildRoot?: string;
  /** Agent name for the proxy CMD (the npm agent package name). */
  agentName: string;
  /** Optional: override the proxy endpoint for workspace materialization. */
  proxyEndpoint?: string;
}

export interface BuildDirResult {
  /** Absolute path to the generated build directory. */
  buildDir: string;
  /** Relative path from build dir to the agent Dockerfile. */
  agentDockerfilePath: string;
  /** Relative path from build dir to the proxy Dockerfile. */
  proxyDockerfilePath: string;
}

/**
 * Generate the role-centric Docker build directory at
 * `.clawmasons/docker/<role-name>/`.
 *
 * Structure (PRD §7.1):
 * ```
 * <role-name>/
 * ├── <agent-type>/
 * │   ├── Dockerfile
 * │   └── workspace/
 * │       └── (materialized files)
 * ├── mcp-proxy/
 * │   └── Dockerfile
 * └── docker-compose.yaml
 * ```
 */
export function generateRoleDockerBuildDir(
  opts: GenerateBuildDirOptions,
  fsDeps?: {
    mkdirSync?: (p: string, opts?: { recursive?: boolean }) => void;
    writeFileSync?: (p: string, data: string) => void;
  },
): BuildDirResult {
  const deps = {
    mkdirSync: fsDeps?.mkdirSync ?? fs.mkdirSync,
    writeFileSync: fsDeps?.writeFileSync ?? fs.writeFileSync,
  };

  const { role, agentType, projectDir, agentName, proxyEndpoint } = opts;
  const roleName = getAppShortName(role.metadata.name);
  const buildRoot = opts.dockerBuildRoot ?? path.join(projectDir, ".clawmasons", "docker");
  const buildDir = path.join(buildRoot, roleName);

  // --- Agent subdirectory ---
  const agentDir = path.join(buildDir, agentType);
  deps.mkdirSync(agentDir, { recursive: true });

  // Agent Dockerfile
  const resolvedAgent = adaptRoleToResolvedAgent(role, agentType);
  const agentRole = resolvedAgent.roles[0];
  if (!agentRole) {
    throw new Error(`adaptRoleToResolvedAgent produced no roles for "${role.metadata.name}"`);
  }
  const agentDockerfile = generateAgentDockerfile(resolvedAgent, agentRole);
  deps.writeFileSync(path.join(agentDir, "Dockerfile"), agentDockerfile);

  // Workspace files
  const proxyEp = proxyEndpoint ?? `http://proxy-${roleName}:9090`;
  const workspace = materializeForAgent(role, agentType, proxyEp);
  const workspaceDir = path.join(agentDir, "workspace");
  for (const [filePath, content] of workspace) {
    const fullPath = path.join(workspaceDir, filePath);
    deps.mkdirSync(path.dirname(fullPath), { recursive: true });
    deps.writeFileSync(fullPath, content);
  }

  // --- MCP Proxy subdirectory ---
  const proxyDir = path.join(buildDir, "mcp-proxy");
  deps.mkdirSync(proxyDir, { recursive: true });

  const proxyDockerfile = generateProxyDockerfile(agentRole, agentName);
  deps.writeFileSync(path.join(proxyDir, "Dockerfile"), proxyDockerfile);

  // --- Reference docker-compose.yaml ---
  const refCompose = generateReferenceBuildCompose(roleName, agentType);
  deps.writeFileSync(path.join(buildDir, "docker-compose.yaml"), refCompose);

  return {
    buildDir,
    agentDockerfilePath: `${agentType}/Dockerfile`,
    proxyDockerfilePath: "mcp-proxy/Dockerfile",
  };
}

/**
 * Generate a reference docker-compose.yaml for the build directory.
 * This is informational — the runnable compose file lives in the session dir.
 */
function generateReferenceBuildCompose(
  roleName: string,
  agentType: string,
): string {
  return `# Reference docker-compose for role: ${roleName}
# This is for reference only. Runnable compose files are in session directories.
# See .clawmasons/sessions/<session-id>/docker-compose.yaml
services:
  proxy-${roleName}:
    build:
      context: ../../../docker
      dockerfile: ../docker/${roleName}/mcp-proxy/Dockerfile
    environment:
      - CHAPTER_PROXY_TOKEN=\${CHAPTER_PROXY_TOKEN}
      - CREDENTIAL_PROXY_TOKEN=\${CREDENTIAL_PROXY_TOKEN}
    ports:
      - "9090:9090"

  agent-${roleName}:
    build:
      context: ..
      dockerfile: ${roleName}/${agentType}/Dockerfile
    depends_on:
      - proxy-${roleName}
    environment:
      - MCP_PROXY_TOKEN=\${CHAPTER_PROXY_TOKEN}
`;
}

// ---------------------------------------------------------------------------
// Session Directory Generation
// ---------------------------------------------------------------------------

export interface SessionComposeOptions {
  /** Absolute path to the project root. */
  projectDir: string;
  /** Absolute path to the role's Docker build directory. */
  dockerBuildDir: string;
  /** Absolute path to the docker/ dir (for proxy build context). */
  dockerDir: string;
  /** Role short name. */
  roleName: string;
  /** Agent type (e.g., "claude-code"). */
  agentType: string;
  /** Agent name for service naming. */
  agentName: string;
  /** Proxy authentication token. */
  proxyToken: string;
  /** Credential proxy token. */
  credentialProxyToken: string;
  /** Proxy port on host. */
  proxyPort?: number;
  /** Volume mask entries from generateVolumeMasks(). */
  volumeMasks?: VolumeMaskEntry[];
  /** Role-declared extra mounts. */
  roleMounts?: RoleMount[];
  /** Declared credential keys. */
  credentialKeys?: string[];
  /** Session type (e.g., "interactive", "acp"). */
  sessionType?: string;
  /** ACP command args. */
  acpCommand?: string[];
  /** Absolute path to the session directory (for relative path computation). */
  sessionDir: string;
  /** Absolute path to logs directory. */
  logsDir: string;
}

/**
 * Generate a self-contained docker-compose.yaml for a session directory.
 *
 * All paths are relative to the session directory, making the session dir
 * a fully functional Docker Compose project. Users can run:
 * - `docker compose logs -f`
 * - `docker compose ps`
 * - `docker compose exec agent sh`
 * - `docker compose down`
 *
 * from the session directory.
 */
export function generateSessionComposeYml(opts: SessionComposeOptions): string {
  const {
    projectDir,
    dockerBuildDir,
    dockerDir,
    roleName,
    agentType,
    proxyToken,
    credentialProxyToken,
    proxyPort = 9090,
    volumeMasks = [],
    roleMounts,
    credentialKeys,
    sessionType,
    acpCommand,
    sessionDir,
    logsDir,
  } = opts;

  // Compute relative paths from session directory
  const relDockerDir = path.relative(sessionDir, dockerDir);
  const relBuildDir = path.relative(sessionDir, dockerBuildDir);
  const relProjectDir = path.relative(sessionDir, projectDir);
  const relLogsDir = path.relative(sessionDir, logsDir);
  const relSentinel = path.relative(sessionDir, path.join(projectDir, SENTINEL_RELATIVE_PATH));

  const proxyServiceName = `proxy-${roleName}`;
  const agentServiceName = `agent-${roleName}`;

  // --- Proxy service ---
  const proxyEnvLines = [
    `      - CHAPTER_PROXY_TOKEN=${proxyToken}`,
    `      - CREDENTIAL_PROXY_TOKEN=${credentialProxyToken}`,
  ];
  if (sessionType) {
    proxyEnvLines.push(`      - CHAPTER_SESSION_TYPE=${sessionType}`);
  }
  if (credentialKeys && credentialKeys.length > 0) {
    proxyEnvLines.push(`      - CHAPTER_DECLARED_CREDENTIALS=${JSON.stringify(credentialKeys)}`);
  }

  // --- Agent volumes ---
  const agentVolumeLines = [
    `      - ${relProjectDir}:${PROJECT_MOUNT_PATH}:ro`,
  ];

  // Volume masks: directories first (named volumes), then files (bind mounts)
  for (const mask of volumeMasks) {
    if (mask.type === "directory") {
      agentVolumeLines.push(`      - ${mask.volumeName}:${mask.containerPath}`);
    } else {
      agentVolumeLines.push(`      - ${relSentinel}:${mask.containerPath}:ro`);
    }
  }

  // Role-declared extra mounts
  for (const vol of resolveRoleMountVolumes(roleMounts)) {
    agentVolumeLines.push(`      - ${vol}`);
  }

  // --- Agent environment ---
  const agentEnvLines = [
    `      - MCP_PROXY_TOKEN=${proxyToken}`,
    `      - MCP_PROXY_URL=http://${proxyServiceName}:9090`,
  ];
  if (credentialKeys && credentialKeys.length > 0) {
    agentEnvLines.push(`      - AGENT_CREDENTIALS=${JSON.stringify(credentialKeys)}`);
  }

  // --- Command override ---
  const commandLine = acpCommand
    ? `\n    command: ${JSON.stringify(acpCommand)}`
    : "";

  // --- Named volumes declaration ---
  const namedVolumes = volumeMasks.filter((m) => m.type === "directory");
  const volumesSection = namedVolumes.length > 0
    ? `\nvolumes:\n${namedVolumes.map((v) => `  ${v.volumeName}:`).join("\n")}\n`
    : "";

  return `# Generated by clawmasons — session compose file
# Run docker compose commands from this directory:
#   docker compose logs -f
#   docker compose ps
#   docker compose exec ${agentServiceName} sh
#   docker compose down
services:
  ${proxyServiceName}:
    build:
      context: ${relDockerDir}
      dockerfile: ${path.relative(dockerDir, path.join(dockerBuildDir, "mcp-proxy", "Dockerfile"))}
    volumes:
      - ${relProjectDir}:${PROJECT_MOUNT_PATH}:ro
      - ${relLogsDir}:/logs
    environment:
${proxyEnvLines.join("\n")}
    ports:
      - "${proxyPort}:9090"
    restart: "no"

  ${agentServiceName}:
    build:
      context: ${relDockerDir}
      dockerfile: ${path.relative(dockerDir, path.join(dockerBuildDir, agentType, "Dockerfile"))}
    volumes:
${agentVolumeLines.join("\n")}
    depends_on:
      - ${proxyServiceName}
    environment:
${agentEnvLines.join("\n")}${commandLine}
    stdin_open: true
    tty: true
    init: true
    restart: "no"
${volumesSection}`;
}

// ---------------------------------------------------------------------------
// Session Directory Creation
// ---------------------------------------------------------------------------

export interface CreateSessionOptions {
  /** Absolute path to the project root. */
  projectDir: string;
  /** Absolute path to the role's Docker build directory. */
  dockerBuildDir: string;
  /** Absolute path to the docker/ dir (for proxy build context). */
  dockerDir: string;
  /** Role definition. */
  role: RoleType;
  /** Agent type (e.g., "claude-code"). */
  agentType: string;
  /** Agent name for proxy CMD. */
  agentName: string;
  /** Proxy port. */
  proxyPort?: number;
  /** Role-declared mounts. */
  roleMounts?: RoleMount[];
  /** Declared credential keys. */
  credentialKeys?: string[];
  /** Session type. */
  sessionType?: string;
  /** ACP command args. */
  acpCommand?: string[];
}

export interface SessionResult {
  /** Unique session ID. */
  sessionId: string;
  /** Absolute path to the session directory. */
  sessionDir: string;
  /** Absolute path to the compose file. */
  composeFile: string;
  /** Absolute path to the logs directory. */
  logsDir: string;
  /** Generated proxy token. */
  proxyToken: string;
  /** Generated credential proxy token. */
  credentialProxyToken: string;
  /** Proxy service name. */
  proxyServiceName: string;
  /** Agent service name. */
  agentServiceName: string;
}

/**
 * Create a session directory with a self-contained docker-compose.yaml.
 *
 * @returns Session metadata including paths, tokens, and service names.
 */
export function createSessionDirectory(
  opts: CreateSessionOptions,
  fsDeps?: {
    mkdirSync?: (p: string, opts?: { recursive?: boolean }) => void;
    writeFileSync?: (p: string, data: string) => void;
    randomBytes?: (n: number) => Buffer;
  },
): SessionResult {
  const deps = {
    mkdirSync: fsDeps?.mkdirSync ?? fs.mkdirSync,
    writeFileSync: fsDeps?.writeFileSync ?? fs.writeFileSync,
    randomBytes: fsDeps?.randomBytes ?? crypto.randomBytes,
  };

  const { role, projectDir } = opts;
  const roleName = getAppShortName(role.metadata.name);

  // Generate session ID
  const sessionId = deps.randomBytes(4).toString("hex");

  // Create session directory
  const sessionDir = path.join(projectDir, ".clawmasons", "sessions", sessionId);
  deps.mkdirSync(sessionDir, { recursive: true });

  // Create logs directory
  const logsDir = path.join(sessionDir, "logs");
  deps.mkdirSync(logsDir, { recursive: true });

  // Ensure sentinel file exists
  ensureSentinelFile(projectDir, fsDeps ? {
    existsSync: () => false, // always create in test mode
    mkdirSync: deps.mkdirSync as (p: string, opts?: { recursive?: boolean }) => void,
    writeFileSync: deps.writeFileSync as (p: string, data: string, opts?: { mode?: number }) => void,
    chmodSync: () => {},
  } : undefined);

  // Generate tokens
  const proxyToken = deps.randomBytes(32).toString("hex");
  const credentialProxyToken = deps.randomBytes(32).toString("hex");

  // Compute volume masks from role's container.ignore.paths
  const ignorePaths = role.container?.ignore?.paths ?? [];
  const volumeMasks = generateVolumeMasks(ignorePaths);

  // Generate compose file
  const composeContent = generateSessionComposeYml({
    ...opts,
    roleName,
    proxyToken,
    credentialProxyToken,
    volumeMasks,
    sessionDir,
    logsDir,
  });

  const composeFile = path.join(sessionDir, "docker-compose.yaml");
  deps.writeFileSync(composeFile, composeContent);

  const proxyServiceName = `proxy-${roleName}`;
  const agentServiceName = `agent-${roleName}`;

  return {
    sessionId,
    sessionDir,
    composeFile,
    logsDir,
    proxyToken,
    credentialProxyToken,
    proxyServiceName,
    agentServiceName,
  };
}
