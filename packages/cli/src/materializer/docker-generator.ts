/**
 * Role-centric Docker build directory and session generation.
 *
 * Generates:
 * 1. Docker build directories at `.mason/docker/<role-name>/` (PRD §7.1)
 * 2. Volume masking for container.ignore.paths (PRD §7.3)
 * 3. Sentinel empty file for file-level volume masking
 * 4. Session directories with self-contained compose files (PRD §7.5)
 *
 * @module docker-generator
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as os from "node:os";
import type { Role } from "@clawmasons/shared";
import { getAppShortName, CLI_NAME_UPPERCASE } from "@clawmasons/shared";
import { materializeForAgent, getMaterializer, getAgentFromRegistry, resolveTaskContent } from "./role-materializer.js";
import { generateAgentDockerfile } from "../generator/agent-dockerfile.js";
import { generateProxyDockerfile } from "../generator/proxy-dockerfile.js";
import { adaptRoleToResolvedAgent } from "@clawmasons/shared";
import { resolveRoleMountVolumes, type RoleMount } from "../generator/mount-volumes.js";
import type { DevContainerCustomizations } from "@clawmasons/agent-sdk";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Path to sentinel empty file relative to project root. */
const SENTINEL_RELATIVE_PATH = ".mason/empty-file";

/** Container path where the project is mounted read-only. */
const PROJECT_MOUNT_PATH = "/home/mason/workspace/project";

/**
 * Get the current host user's UID and GID.
 * Returns string values suitable for Docker build args.
 */
export function getHostIds(): { uid: string; gid: string } {
  const info = os.userInfo();
  return { uid: String(info.uid), gid: String(info.gid) };
}

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
 * Sanitize a file entry name into a Docker Compose config name.
 *
 * E.g. `.mcp.json` → `overlay-mcp-json`, `AGENTS.md` → `overlay-agents-md`.
 */
function sanitizeOverlayConfigName(entry: string): string {
  const cleaned = entry
    .toLowerCase()
    .replace(/[/\\]/g, "-")
    .replace(/\./g, "-")
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `overlay-${cleaned}`;
}

/**
 * Sanitize a file mask path into a Docker Compose config name.
 *
 * E.g. `.env` → `mask-env`, `.env.local` → `mask-env-local`.
 */
function sanitizeMaskConfigName(entry: string): string {
  const cleaned = entry
    .toLowerCase()
    .replace(/[/\\]/g, "-")
    .replace(/\./g, "-")
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `mask-${cleaned}`;
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
 * Ensure the sentinel empty file exists at `.mason/empty-file`.
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
  /** The resolved Role to generate for. */
  role: Role;
  /** Target agent type (e.g., "claude-code-agent"). */
  agentType: string;
  /** Absolute path to the project root. */
  projectDir: string;
  /** Root of docker build output (defaults to `<projectDir>/.mason/docker`). */
  dockerBuildRoot?: string;
  /** Agent name for the proxy CMD (the npm agent package name). */
  agentName: string;
  /** Optional: override the proxy endpoint for workspace materialization. */
  proxyEndpoint?: string;
  /** Dev-container customizations to embed in the agent Dockerfile LABEL. */
  devContainerCustomizations?: DevContainerCustomizations;
  /** Additional credential env var keys from agent config (.mason/config.json) to include in agent-launch.json. */
  agentConfigCredentials?: string[];
  /** Extra args from alias config to append to the agent invocation. */
  agentArgs?: string[];
  /** Initial prompt passed to the agent as the first user message at launch. */
  initialPrompt?: string;
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
 * `.mason/docker/<role-name>/`.
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
  const buildRoot = opts.dockerBuildRoot ?? path.join(projectDir, ".mason", "docker");
  const buildDir = path.join(buildRoot, roleName);

  // --- Agent subdirectory ---
  const agentDir = path.join(buildDir, agentType);
  deps.mkdirSync(agentDir, { recursive: true });

  // Home directory materialization (if the materializer supports it)
  // Skip when fsDeps is provided (test mode) since materializeHome uses real fs
  const materializer = getMaterializer(agentType);
  let hasHome = false;
  if (!fsDeps && materializer?.materializeHome) {
    const homePath = path.join(agentDir, "home");
    materializer.materializeHome(projectDir, homePath);
    hasHome = true;
  }

  // Agent Dockerfile
  const resolvedAgent = adaptRoleToResolvedAgent(role, agentType);
  resolveTaskContent(resolvedAgent, role);
  const agentRole = resolvedAgent.roles[0];
  if (!agentRole) {
    throw new Error(`adaptRoleToResolvedAgent produced no roles for "${role.metadata.name}"`);
  }
  const isSupervisor = role.type === "supervisor";
  const agentPkg = getAgentFromRegistry(agentType);
  const agentDockerfile = generateAgentDockerfile(resolvedAgent, agentRole, {
    hasHome: hasHome || isSupervisor,
    dockerfileConfig: agentPkg?.dockerfile,
    devContainerCustomizations: opts.devContainerCustomizations,
    roleType: role.type,
  });
  deps.writeFileSync(path.join(agentDir, "Dockerfile"), agentDockerfile);

  // Workspace files — split into output buckets:
  // File routing:
  // - agent-launch.json          → {agentDir}/workspace/         (live-mounted to /home/mason/workspace/)
  // - .mcp.json (supervisor)     → {agentDir}/workspace/         (Claude Code reads from WORKDIR = /home/mason/workspace)
  // - project role: everything else → {agentDir}/build/workspace/project/  (per-file overlay mounts)
  // - supervisor role: everything else → {agentDir}/home/         (merged into home mount at /home/mason/)
  const proxyEp = proxyEndpoint ?? `http://proxy-${roleName}:9090`;
  const materializeOpts = (opts.agentConfigCredentials?.length || opts.agentArgs?.length || opts.initialPrompt)
    ? {
        ...(opts.agentConfigCredentials?.length ? { agentConfigCredentials: opts.agentConfigCredentials } : {}),
        ...(opts.agentArgs?.length ? { agentArgs: opts.agentArgs } : {}),
        ...(opts.initialPrompt ? { initialPrompt: opts.initialPrompt } : {}),
      }
    : undefined;
  const workspaceDir = path.join(agentDir, "workspace");
  const buildWorkspaceProjectDir = path.join(agentDir, "build", "workspace", "project");
  const homeBuildDir = path.join(agentDir, "home");
  const workspace = (isSupervisor && materializer?.materializeSupervisor)
    ? materializer.materializeSupervisor(
        resolvedAgent,
        proxyEp,
        undefined,
        materializeOpts,
        !fsDeps ? homeBuildDir : undefined,
      )
    : materializeForAgent(role, agentType, proxyEp, undefined, materializeOpts, !fsDeps ? homeBuildDir : undefined);
  for (const [filePath, content] of workspace) {
    const targetDir = filePath === "agent-launch.json"
      ? workspaceDir
      : (isSupervisor || filePath === ".claude.json") ? homeBuildDir : buildWorkspaceProjectDir;
    const fullPath = path.join(targetDir, filePath);
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
# See .mason/sessions/<session-id>/docker-compose.yaml
services:
  proxy-${roleName}:
    build:
      context: ../../../docker
      dockerfile: ../docker/${roleName}/mcp-proxy/Dockerfile
    environment:
      - ${CLI_NAME_UPPERCASE}_PROXY_TOKEN=\${${CLI_NAME_UPPERCASE}_PROXY_TOKEN}
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
      - MCP_PROXY_TOKEN=\${${CLI_NAME_UPPERCASE}_PROXY_TOKEN}
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
  /** Agent type (e.g., "claude-code-agent"). */
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
  /** Absolute path to the materialized agent home directory (if exists). */
  homePath?: string;
  /** Host user UID for container user matching. */
  hostUid?: string;
  /** Host user GID for container user matching. */
  hostGid?: string;
  /** Absolute path to {agentDir}/workspace/ — live-mounted to /home/mason/workspace/. */
  workspacePath?: string;
  /** Absolute path to {agentDir}/build/workspace/project/ — files here get per-entry overlay mounts. */
  buildWorkspaceProjectPath?: string;
  /** File entries inside buildWorkspaceProjectPath — mounted via Docker Compose configs (VirtioFS-safe). */
  buildWorkspaceProjectFileEntries?: string[];
  /** Directory entries inside buildWorkspaceProjectPath — mounted as bind-mount overlays. */
  buildWorkspaceProjectDirEntries?: string[];
  /** Override bind-mount path for /home/mason/ (e.g. --home flag). */
  homeOverride?: string;
  /** VS Code server host path to mount at /home/mason/.vscode-server. */
  vscodeServerHostPath?: string;
  /** Set AGENT_COMMAND_OVERRIDE=bash in agent environment. */
  bashMode?: boolean;
  /** Set AGENT_ENTRY_VERBOSE=1 in agent environment. */
  verbose?: boolean;
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
    homePath,
    hostUid,
    hostGid,
    workspacePath,
    buildWorkspaceProjectPath,
    buildWorkspaceProjectFileEntries = [],
    buildWorkspaceProjectDirEntries = [],
    homeOverride,
    vscodeServerHostPath,
    bashMode,
    verbose,
  } = opts;

  // Unique compose project name derived from project directory
  const projectHash = crypto.createHash("sha256").update(projectDir).digest("hex").slice(0, 8);
  const composeName = `mason-${projectHash}`;

  // Compute relative paths from session directory.
  // Prefix with ./ so Docker Compose treats them as bind mounts (not named volumes).
  const rel = (to: string) => {
    const r = path.relative(sessionDir, to);
    return r.startsWith(".") ? r : `./${r}`;
  };
  const relDockerDir = rel(dockerDir);
  const relProjectDir = rel(projectDir);
  const relLogsDir = rel(logsDir);
  const relSentinel = rel(path.join(projectDir, SENTINEL_RELATIVE_PATH));

  const proxyServiceName = `proxy-${roleName}`;
  const agentServiceName = `agent-${roleName}`;

  // --- Proxy service ---
  const proxyEnvLines = [
    `      - ${CLI_NAME_UPPERCASE}_PROXY_TOKEN=${proxyToken}`,
    `      - CREDENTIAL_PROXY_TOKEN=${credentialProxyToken}`,
    `      - PROJECT_DIR=${PROJECT_MOUNT_PATH}`,
  ];
  if (sessionType) {
    proxyEnvLines.push(`      - ${CLI_NAME_UPPERCASE}_SESSION_TYPE=${sessionType}`);
  }
  if (credentialKeys && credentialKeys.length > 0) {
    proxyEnvLines.push(`      - ${CLI_NAME_UPPERCASE}_DECLARED_CREDENTIALS=${JSON.stringify(credentialKeys)}`);
  }

  // --- Agent volumes ---
  const agentVolumeLines: string[] = [];

  // Home override (user-specified --home path, before other mounts)
  if (homeOverride) {
    const relHomeOverride = rel(homeOverride);
    agentVolumeLines.push(`      - ${relHomeOverride}:/home/mason/`);
  }

  // Project mount (no :ro — agents need write access)
  agentVolumeLines.push(`      - ${relProjectDir}:${PROJECT_MOUNT_PATH}`);

  // Volume masks: directories only (named volumes); file masks routed through configs below
  for (const mask of volumeMasks) {
    if (mask.type === "directory") {
      agentVolumeLines.push(`      - ${mask.volumeName}:${mask.containerPath}`);
    }
  }

  // Role-declared extra mounts
  for (const vol of resolveRoleMountVolumes(roleMounts)) {
    agentVolumeLines.push(`      - ${vol}`);
  }

  // Logs dir mount
  agentVolumeLines.push(`      - ${relLogsDir}:/logs`);

  // Workspace directory mount (live bind mount for agent-launch.json)
  if (workspacePath) {
    const relWorkspacePath = rel(workspacePath);
    agentVolumeLines.push(`      - ${relWorkspacePath}:/home/mason/workspace`);
  }

  // Directory overlay mounts (bind mounts — VirtioFS-safe for directories)
  if (buildWorkspaceProjectPath && buildWorkspaceProjectDirEntries.length > 0) {
    for (const entry of buildWorkspaceProjectDirEntries) {
      const hostEntryPath = path.join(buildWorkspaceProjectPath, entry);
      const relEntryPath = rel(hostEntryPath);
      agentVolumeLines.push(`      - ${relEntryPath}:/home/mason/workspace/project/${entry}`);
    }
  }

  // VS Code server persistent mount (dev-container mode)
  if (vscodeServerHostPath) {
    const relVscodePath = rel(vscodeServerHostPath);
    agentVolumeLines.push(`      - ${relVscodePath}:/home/mason/.vscode-server`);
  }

  // Home directory mount (materialized host config from build dir)
  if (homePath) {
    const relHomePath = rel(homePath);
    agentVolumeLines.push(`      - ${relHomePath}:/home/mason`);
  }

  // --- File overlay & mask configs (Docker Compose configs — mounted as tmpfs, VirtioFS-safe) ---
  const configEntries: Array<{ name: string; relPath: string; target: string }> = [];

  // Overlay file configs (materialized workspace files)
  if (buildWorkspaceProjectPath && buildWorkspaceProjectFileEntries.length > 0) {
    for (const entry of buildWorkspaceProjectFileEntries) {
      configEntries.push({
        name: sanitizeOverlayConfigName(entry),
        relPath: rel(path.join(buildWorkspaceProjectPath, entry)),
        target: `/home/mason/workspace/project/${entry}`,
      });
    }
  }

  // File mask configs (sentinel empty file → container path, VirtioFS-safe)
  for (const mask of volumeMasks) {
    if (mask.type === "file") {
      configEntries.push({
        name: sanitizeMaskConfigName(mask.hostPath),
        relPath: relSentinel,
        target: mask.containerPath,
      });
    }
  }

  const serviceConfigsBlock = configEntries.length > 0
    ? `    configs:\n${configEntries.map((c) =>
        `      - source: ${c.name}\n        target: ${c.target}`
      ).join("\n")}\n`
    : "";

  const topLevelConfigsSection = configEntries.length > 0
    ? `\nconfigs:\n${configEntries.map((c) => `  ${c.name}:\n    file: ${c.relPath}`).join("\n")}\n`
    : "";

  // --- Agent environment ---
  const agentEnvLines = [
    `      - MCP_PROXY_TOKEN=${proxyToken}`,
    `      - MCP_PROXY_URL=http://${proxyServiceName}:9090`,
  ];
  if (credentialKeys && credentialKeys.length > 0) {
    agentEnvLines.push(`      - AGENT_CREDENTIALS=${JSON.stringify(credentialKeys)}`);
  }
  if (bashMode) {
    agentEnvLines.push(`      - AGENT_COMMAND_OVERRIDE=bash`);
  }
  if (verbose) {
    agentEnvLines.push(`      - AGENT_ENTRY_VERBOSE=1`);
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
name: ${composeName}
services:
  ${proxyServiceName}:
    build:
      context: ${relDockerDir}
      dockerfile: ${path.relative(dockerDir, path.join(dockerBuildDir, "mcp-proxy", "Dockerfile"))}
    volumes:
      - ${relProjectDir}:${PROJECT_MOUNT_PATH}
      - ${relLogsDir}:/logs
      - ${rel(path.join(dockerBuildDir, "mcp-proxy", ".cache"))}:/app/.cache
    environment:
${proxyEnvLines.join("\n")}
    ports:
      - "${proxyPort}:9090"
    restart: "no"

  ${agentServiceName}:
    build:
      context: ${relDockerDir}
      dockerfile: ${path.relative(dockerDir, path.join(dockerBuildDir, agentType, "Dockerfile"))}
      args:
        HOST_UID: "${hostUid ?? "1000"}"
        HOST_GID: "${hostGid ?? "1000"}"
    volumes:
${agentVolumeLines.join("\n")}
${serviceConfigsBlock}    depends_on:
      - ${proxyServiceName}
    environment:
${agentEnvLines.join("\n")}${commandLine}
    stdin_open: true
    tty: true
    init: true
    restart: "no"
${topLevelConfigsSection}${volumesSection}`;
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
  role: Role;
  /** Agent type (e.g., "claude-code-agent"). */
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
  /** Host user UID for container user matching. */
  hostUid?: string;
  /** Host user GID for container user matching. */
  hostGid?: string;
  /** Override bind-mount path for /home/mason/ (e.g. --home flag). */
  homeOverride?: string;
  /** VS Code server host path to mount at /home/mason/.vscode-server. */
  vscodeServerHostPath?: string;
  /** Set AGENT_COMMAND_OVERRIDE=bash in agent environment. */
  bashMode?: boolean;
  /** Set AGENT_ENTRY_VERBOSE=1 in agent environment. */
  verbose?: boolean;
  /** Pre-determined session ID (overrides random generation, for testing). */
  sessionId?: string;
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
  const sessionId = opts.sessionId ?? deps.randomBytes(4).toString("hex");

  // Create session directory
  const sessionDir = path.join(projectDir, ".mason", "sessions", sessionId);
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

  // Detect materialized home directory.
  // Supervisor roles always populate home/ (role content merged there during generateRoleDockerBuildDir).
  const homePath = path.join(opts.dockerBuildDir, opts.agentType, "home");
  const homeExists = role.type === "supervisor" || (fsDeps ? false : fs.existsSync(homePath));

  // Compute workspace and build overlay paths
  const workspacePath = path.join(opts.dockerBuildDir, opts.agentType, "workspace");
  const buildWorkspaceProjectPath = path.join(opts.dockerBuildDir, opts.agentType, "build", "workspace", "project");

  // Enumerate and classify build workspace project entries (skip in test mode — fsDeps means no real FS)
  const buildWorkspaceProjectFileEntries: string[] = [];
  const buildWorkspaceProjectDirEntries: string[] = [];
  if (!fsDeps && fs.existsSync(buildWorkspaceProjectPath)) {
    for (const entry of fs.readdirSync(buildWorkspaceProjectPath)) {
      const entryPath = path.join(buildWorkspaceProjectPath, entry);
      if (fs.statSync(entryPath).isDirectory()) {
        buildWorkspaceProjectDirEntries.push(entry);
      } else {
        buildWorkspaceProjectFileEntries.push(entry);
      }
    }
  }

  // Generate compose file
  const composeContent = generateSessionComposeYml({
    ...opts,
    roleName,
    proxyToken,
    credentialProxyToken,
    volumeMasks,
    sessionDir,
    logsDir,
    homePath: homeExists ? homePath : undefined,
    workspacePath,
    buildWorkspaceProjectPath,
    buildWorkspaceProjectFileEntries,
    buildWorkspaceProjectDirEntries,
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
