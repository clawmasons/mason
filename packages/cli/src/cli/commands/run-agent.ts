import { type Command, Option } from "commander";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Readable, Writable } from "node:stream";
import { spawn } from "node:child_process";
import { checkDockerCompose } from "./docker-utils.js";
import { quickAutoCleanup } from "./doctor.js";
import { ensureGitignoreEntry } from "../../runtime/gitignore.js";
import type { ResolvedAgent, ResolvedApp, Role, AppConfig, TaskRef, SkillRef } from "@clawmasons/shared";
import { computeToolFilters, resolveRole as resolveRoleByName, adaptRoleToResolvedAgent, getAppShortName, resolveDialectName, getKnownDirectories, scanProject, getDialect } from "@clawmasons/shared";
import { getAgentFromRegistry, initRegistry, getAllRegisteredNames, BUILTIN_AGENTS, materializeForAgent } from "../../materializer/role-materializer.js";
import { loadConfigAgentEntry, loadConfigAliasEntry, getAgentConfig, saveAgentConfig, readDefaultAgent } from "@clawmasons/agent-sdk";
import { promptConfig, ConfigResolutionError } from "../../config/prompt-config.js";
import { AcpSession, type AcpSessionConfig, type AcpSessionDeps } from "../../acp/session.js";
import { AcpSdkBridge, type AcpSdkBridgeConfig } from "../../acp/bridge.js";
import { HostProxy } from "@clawmasons/proxy";
import { createFileLogger, type AcpLogger } from "../../acp/logger.js";
import { generateRoleDockerBuildDir, createSessionDirectory, getHostIds } from "../../materializer/docker-generator.js";
import { ensureProxyDependencies, synthesizeRolePackages } from "../../materializer/proxy-dependencies.js";

// ── Local type alias (mirrors DevContainerCustomizations from agent-sdk) ──────
type DevContainerCustomizations = { vscode?: { extensions?: string[]; settings?: Record<string, unknown> } };

// ── Role-based Agent Resolution ───────────────────────────────────────

/**
 * Resolve a Role from a role name in the project directory.
 */
async function defaultResolveRole(
  roleName: string,
  projectDir: string,
): Promise<Role> {
  return resolveRoleByName(roleName, projectDir);
}

/**
 * Resolve a ResolvedAgent from a Role and agent type.
 */
function defaultAdaptRole(
  roleType: Role,
  agentType: string,
): ResolvedAgent {
  return adaptRoleToResolvedAgent(roleType, agentType);
}

/**
 * Infer the agent type from a Role's source dialect.
 *
 * When the dialect is "mason" or unset, uses the provided `defaultAgent`
 * (typically from `.mason/config.json` `defaultAgent` field), falling back
 * to "claude-code-agent" for backward compatibility.
 */
export function inferAgentType(roleType: Role, defaultAgent?: string): string {
  const dialect = roleType.source.agentDialect;
  // "mason" is the agent-agnostic canonical location — use configurable default
  if (!dialect || dialect === "mason") return defaultAgent ?? "claude-code-agent";
  return dialect;
}

// ── Types ──────────────────────────────────────────────────────────────

/**
 * Generate a short unique session ID (8 hex characters).
 */
export function generateSessionId(): string {
  return crypto.randomBytes(4).toString("hex");
}

// ── Agent Type Resolution ─────────────────────────────────────────────

/**
 * Resolve a user-provided agent type string to the internal materializer name.
 * Checks the agent registry (which includes aliases from AgentPackage).
 *
 * @returns The resolved agent type, or undefined if not recognized
 */
export function resolveAgentType(input: string): string | undefined {
  const agentPkg = getAgentFromRegistry(input);
  return agentPkg?.name;
}

/**
 * Check whether a string matches a known agent type (including aliases).
 */
export function isKnownAgentType(input: string): boolean {
  return resolveAgentType(input) !== undefined;
}

/**
 * Get a user-friendly list of known agent type names (canonical names + aliases from registry).
 */
export function getKnownAgentTypeNames(): string[] {
  const names = new Set<string>(getAllRegisteredNames());
  return [...names].sort();
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
 * Execute a docker compose command with the given compose file.
 * Returns a promise that resolves with the exit code.
 */
export function execComposeCommand(
  composeFile: string,
  args: string[],
  opts?: { interactive?: boolean; verbose?: boolean; timeoutMs?: number },
): Promise<number> {
  const baseArgs = ["compose", "-f", composeFile, ...args];
  const showOutput = opts?.interactive || opts?.verbose;

  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const settle = (code: number) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(code);
    };

    const child = showOutput
      ? spawn("docker", baseArgs, { stdio: "inherit" })
      : spawn("docker", baseArgs, { stdio: ["ignore", "ignore", "pipe"] });

    let stderr = "";
    if (!showOutput) {
      child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    }

    child.on("close", (code) => {
      if (!showOutput && code !== 0 && stderr) {
        console.error(stderr);
      }
      settle(code ?? 0);
    });
    child.on("error", () => settle(1));

    if (opts?.timeoutMs) {
      const ms = opts.timeoutMs;
      timer = setTimeout(() => {
        if (!settled) {
          child.kill("SIGKILL");
          console.error(
            `\n  Docker command timed out after ${Math.round(ms / 1000)}s.` +
            `\n  Run \`mason doctor --auto\` to clean up stale resources, or restart Docker Desktop.\n`,
          );
          settle(1);
        }
      }, ms);
    }
  });
}

// ── OCI Restart Policy ───────────────────────────────────────────────

const OCI_RESTART_MAX = 3;
const OCI_RESTART_DELAY_MS = 2000;

/**
 * Run `docker compose run` interactively while capturing stderr for OCI detection.
 * stdin and stdout are inherited (interactive); stderr is piped and tee'd to process.stderr.
 * Returns { code, stderr }.
 */
export function execComposeRunWithStderr(
  composeFile: string,
  args: string[],
): Promise<{ code: number; stderr: string }> {
  const baseArgs = ["compose", "-f", composeFile, ...args];
  return new Promise((resolve) => {
    const child = spawn("docker", baseArgs, {
      stdio: ["inherit", "inherit", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on("close", (code) => resolve({ code: code ?? 0, stderr }));
    child.on("error", () => resolve({ code: 1, stderr }));
  });
}

/**
 * Run `docker compose run` with stdout piped for line-by-line processing.
 * stdin is inherited; stdout is piped and each line triggers `onLine`; stderr is captured.
 */
export function execComposeRunWithStreamCapture(
  composeFile: string,
  args: string[],
  onLine: (line: string) => void,
): Promise<{ code: number; stderr: string }> {
  const baseArgs = ["compose", "-f", composeFile, ...args];
  return new Promise((resolve) => {
    const child = spawn("docker", baseArgs, {
      stdio: ["inherit", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
    });

    // Read stdout line by line
    let buffer = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);
        if (line.length > 0) {
          onLine(line);
        }
      }
    });
    child.stdout?.on("end", () => {
      // Flush any remaining content without a trailing newline
      if (buffer.length > 0) {
        onLine(buffer);
      }
    });

    child.on("close", (code) => resolve({ code: code ?? 0, stderr }));
    child.on("error", () => resolve({ code: 1, stderr }));
  });
}

/**
 * Collect single-file volume bind-mount host paths from a compose YAML string.
 * Returns paths where the host side resolves to a regular file (not a directory).
 */
export function collectSingleFileMounts(composeYaml: string, baseDir: string): string[] {
  const singleFiles: string[] = [];
  // Match volume lines of the form: - <hostPath>:<containerPath>[:<options>]
  const volumeLineRe = /^\s*-\s+([^:]+):[^:]/gm;
  let match: RegExpExecArray | null;
  while ((match = volumeLineRe.exec(composeYaml)) !== null) {
    const hostPart = match[1].trim();
    // Skip named volumes (no path separator)
    if (!hostPart.includes("/") && !hostPart.startsWith(".")) continue;
    const resolved = path.resolve(baseDir, hostPart);
    try {
      const stat = fs.statSync(resolved);
      if (stat.isFile()) {
        singleFiles.push(hostPart);
      }
    } catch { /* path doesn't exist — skip */ }
  }
  return singleFiles;
}

/**
 * Run the agent container with OCI-gated restart policy.
 * Restarts only when output contains "OCI runtime", with a 2s pause and max 3 attempts.
 * Prints single-file mount paths on restart with a recommendation.
 */
export async function runAgentWithOciRestart(
  composeFile: string,
  runArgs: string[],
): Promise<number> {
  let attempts = 0;
  while (true) {
    const { code, stderr } = await execComposeRunWithStderr(composeFile, runArgs);
    if (code === 0) return 0;

    const isOciError = stderr.includes("OCI runtime");
    if (!isOciError || attempts >= OCI_RESTART_MAX) {
      if (attempts >= OCI_RESTART_MAX) {
        console.error(`\n  Max OCI restart attempts (${OCI_RESTART_MAX}) reached. Giving up.`);
      }
      return code;
    }

    attempts++;

    // Show single-file mount warning
    try {
      const composeYaml = fs.readFileSync(composeFile, "utf-8");
      const composeDir = path.dirname(composeFile);
      const singleFiles = collectSingleFileMounts(composeYaml, composeDir);
      if (singleFiles.length > 0) {
        console.error(`\n  OCI runtime error detected (attempt ${attempts}/${OCI_RESTART_MAX}). Retrying in ${OCI_RESTART_DELAY_MS / 1000}s...`);
        console.error(`\n  Single-file mounts detected (these can cause mount ordering races):`);
        for (const f of singleFiles) {
          console.error(`    - ${f}`);
        }
        console.error(`  Recommendation: move these files into a directory and mount the directory instead.`);
      } else {
        console.error(`\n  OCI runtime error detected (attempt ${attempts}/${OCI_RESTART_MAX}). Retrying in ${OCI_RESTART_DELAY_MS / 1000}s...`);
      }
    } catch { /* best-effort */ }

    await new Promise((r) => setTimeout(r, OCI_RESTART_DELAY_MS));
  }
}

// ── Environment Variable Credential Collection ───────────────────────

/**
 * Collect environment variables from process.env that match the agent's
 * declared credentials (agent-level + app-level across all roles).
 */
export function collectEnvCredentials(
  agent: ResolvedAgent,
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const declaredKeys = new Set<string>(agent.credentials);
  for (const role of agent.roles) {
    for (const app of role.apps) {
      for (const key of app.credentials) {
        declaredKeys.add(key);
      }
    }
  }

  const collected: Record<string, string> = {};
  for (const key of declaredKeys) {
    const value = env[key];
    if (value !== undefined && value !== "") {
      collected[key] = value;
    }
  }

  return collected;
}

// ── Docker Auto-Build ──────────────────────────────────────────────────

/**
 * Ensure docker build artifacts exist for a role. If not, trigger docker-init.
 */
async function ensureDockerBuild(
  roleType: Role,
  agentType: string,
  projectDir: string,
  deps?: { existsSyncFn?: (p: string) => boolean; forceRebuild?: boolean; devContainerCustomizations?: DevContainerCustomizations; agentConfigCredentials?: string[]; agentArgs?: string[]; initialPrompt?: string; llmConfig?: { provider: string; model: string }; printMode?: boolean },
): Promise<{ dockerBuildDir: string; dockerDir: string }> {
  const existsSync = deps?.existsSyncFn ?? fs.existsSync;
  const roleName = getAppShortName(roleType.metadata.name);
  const dockerDir = path.join(projectDir, ".mason", "docker");
  const dockerBuildDir = path.join(dockerDir, roleName);

  // When --build is used, remove stale build context so node_modules are re-copied
  if (deps?.forceRebuild && existsSync(dockerBuildDir)) {
    console.log(`\n  Removing stale docker build context...`);
    fs.rmSync(dockerBuildDir, { recursive: true, force: true });
  }

  // Compute hash of container.packages to detect changes since last build
  const packagesHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(roleType.container?.packages ?? {}))
    .digest("hex");
  const hashFilePath = path.join(dockerBuildDir, agentType, ".packages-hash");

  // If the Dockerfile exists but packages have changed, invalidate the build dir
  if (existsSync(path.join(dockerBuildDir, agentType, "Dockerfile"))) {
    const storedHash = existsSync(hashFilePath)
      ? fs.readFileSync(hashFilePath, "utf-8").trim()
      : null;
    if (storedHash !== packagesHash) {
      console.log(`\n  Detected container.packages change. Rebuilding Docker artifacts...`);
      fs.rmSync(dockerBuildDir, { recursive: true, force: true });
    }
  }

  if (!existsSync(path.join(dockerBuildDir, agentType, "Dockerfile"))) {
    console.log(`\n  Docker artifacts not found. Building...`);

    // Ensure .mason/.gitignore has docker/ entry
    const gitignorePath = path.join(projectDir, ".mason", ".gitignore");
    const gitignoreDir = path.dirname(gitignorePath);
    fs.mkdirSync(gitignoreDir, { recursive: true });
    if (!existsSync(gitignorePath) || !fs.readFileSync(gitignorePath, "utf-8").includes("docker/")) {
      fs.appendFileSync(gitignorePath, "docker/\nsessions/\n");
    }

    // Generate the build directory
    generateRoleDockerBuildDir({
      role: roleType,
      agentType,
      projectDir,
      agentName: roleName,
      devContainerCustomizations: deps?.devContainerCustomizations,
      agentConfigCredentials: deps?.agentConfigCredentials,
      agentArgs: deps?.agentArgs,
      initialPrompt: deps?.initialPrompt,
      llmConfig: deps?.llmConfig,
      printMode: deps?.printMode,
    });

    // Populate shared proxy dependencies
    ensureProxyDependencies(dockerDir, projectDir);

    // Synthesize inline app/role packages (e.g. mcp_servers from ROLE.md)
    synthesizeRolePackages(roleType, dockerDir);

    // Create per-role cache directory for NODE_COMPILE_CACHE and NPM_CONFIG_CACHE
    fs.mkdirSync(path.join(dockerBuildDir, "mcp-proxy", ".cache"), { recursive: true });

    // Write packages hash so future runs can detect changes
    fs.writeFileSync(hashFilePath, packagesHash);

    console.log(`  Docker artifacts built at .mason/docker/${roleName}/`);
  }

  return { dockerBuildDir, dockerDir };
}

// ── Help Text ─────────────────────────────────────────────────────────

export const RUN_ACP_AGENT_HELP_EPILOG = `
Command Syntax:
  mason run --role <name>                    # infers agent from role dialect
  mason run --role <name> --agent claude     # explicit agent (renamed from --agent-type)
  mason run --role <name> --acp              # ACP mode
  mason claude --role <name>                 # shorthand (config-declared or built-in agent)

  --agent <name>   Agent name from .mason/config.json or built-in alias.
                   Config entry can supply defaults for --role, --home, and mode.
  --home <path>    Bind-mount <path> over /home/mason/ in the agent container.
                   Overrides the "home" property in .mason/config.json.
  --terminal       Force terminal (interactive) mode, overriding config mode.
  --acp            Start in ACP mode (overrides config mode).
  --bash           Launch bash shell (overrides config mode).

Agent Types (built-in):
  claude (claude-code-agent), pi (pi-coding-agent), mcp (mcp-agent)

Session Behavior:
  When an ACP client sends session/new with a "cwd" field, the agent
  container mounts that directory as /home/mason/workspace/project.
  Each session/new starts a fresh agent container; the proxy stays running.
  The credential service runs in-process on the host.

Side Effects:
  - Creates .mason/ in the project for docker builds and session state
  - Appends ".mason" to the project's .gitignore if present
  - Creates .mason/config.json from a default template if absent and
    an agent name is provided

  Credential env vars (e.g. OPEN_ROUTER_KEY, ANTHROPIC_API_KEY) are
  passed through to the credential-service when set in the client's
  env block.
`;

// ── Config Auto-Init ──────────────────────────────────────────────────

/**
 * Build the default `.mason/config.json` content from the built-in agent
 * packages. Uses the first alias as the config key (user-friendly short name)
 * and derives the npm package name from the agent's canonical name.
 */
export function buildDefaultMasonConfig(): string {
  const agents: Record<string, { package: string }> = {};
  for (const agent of BUILTIN_AGENTS) {
    const configKey = agent.aliases?.[0] ?? agent.name;
    agents[configKey] = { package: `@clawmasons/${agent.name}` };
  }
  return JSON.stringify({ agents }, null, 2);
}

/**
 * Create .mason/config.json from the default template if it does not exist.
 * Only called when an agent name is provided on the command line.
 */
export function ensureMasonConfig(projectDir: string): void {
  const masonDir = path.join(projectDir, ".mason");
  const configPath = path.join(masonDir, "config.json");
  if (!fs.existsSync(configPath)) {
    fs.mkdirSync(masonDir, { recursive: true });
    fs.writeFileSync(configPath, buildDefaultMasonConfig() + "\n");
    console.error(`  Created .mason/config.json with default agent configuration.`);
  }
}

// ── Deps Interface ────────────────────────────────────────────────────

/**
 * Dependencies for run-agent, injectable for testing.
 */
export interface RunAgentDeps {
  /** Override the compose command executor (for testing). */
  execComposeFn?: (
    composeFile: string,
    args: string[],
    opts?: { interactive?: boolean; verbose?: boolean },
  ) => Promise<number>;
  /** Override session ID generation (for testing). */
  generateSessionIdFn?: () => string;
  /** Override docker compose check (for testing). */
  checkDockerComposeFn?: () => void;
  /** Override .gitignore entry management (for testing). */
  ensureGitignoreEntryFn?: (dir: string, pattern: string) => boolean;
  /** Override role resolution (for testing). */
  resolveRoleFn?: (roleName: string, projectDir: string) => Promise<Role>;
  /** Override agent adaptation (for testing). */
  adaptRoleFn?: (roleType: Role, agentType: string) => ResolvedAgent;
  /** Override AcpSession construction (for testing, ACP mode). */
  createSessionFn?: (config: AcpSessionConfig, sessionDeps?: AcpSessionDeps) => AcpSession;
  /** Override AcpSdkBridge construction (for testing, ACP mode). */
  createBridgeFn?: (config: AcpSdkBridgeConfig) => AcpSdkBridge;
  /** Override fs.mkdirSync (for testing). */
  mkdirSyncFn?: (dirPath: string, options?: { recursive?: boolean }) => void;
  /** Override fs.existsSync (for testing). */
  existsSyncFn?: (filePath: string) => boolean;
  /** Override the agent run function (for testing). When set, bypasses OCI restart logic. */
  runAgentFn?: (composeFile: string, args: string[]) => Promise<number>;
  /** Override host proxy startup (for testing). */
  startHostProxyFn?: (opts: {
    proxyPort: number;
    relayToken: string;
    envCredentials: Record<string, string>;
    hostApps?: ResolvedApp[];
  }) => Promise<{ stop: () => Promise<void> }>;
  /** Override proxy health check (for testing). */
  waitForProxyHealthFn?: (url: string, timeoutMs: number) => Promise<void>;
  /** Override logger creation (for testing, ACP mode). */
  createLoggerFn?: (logDir: string) => AcpLogger;
  /** Override home path (for testing). */
  homeOverride?: string;
  /** Override registry initialization (for testing). */
  initRegistryFn?: (projectDir: string) => Promise<void>;
}

// ── Backward-compat aliases ───────────────────────────────────────────
export type RunAcpAgentDeps = RunAgentDeps;

// ── Command Registration ──────────────────────────────────────────────

/**
 * Expand a leading ~ in a path to the user's home directory.
 */
function expandHome(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

/**
 * Validate and normalize `--source` flag values against the dialect registry.
 * Each value is resolved to a dialect registry key. If any value is invalid,
 * an error is printed listing available sources and `process.exit(1)` is called.
 */
/**
 * Generate an in-memory project Role by scanning source agent directories.
 *
 * Used when `mason run <agent-type>` is invoked without `--role` and no alias
 * provides a default role. The generated Role feeds into the existing
 * materialization pipeline via `adaptRoleToResolvedAgent()`.
 *
 * @param projectDir - Absolute path to the project root
 * @param sources - Dialect registry keys (e.g., ["claude-code-agent"])
 * @returns A Role object (never persisted to disk)
 */
export async function generateProjectRole(
  projectDir: string,
  sources: string[],
): Promise<Role> {
  // 1. Validate that at least one source directory exists
  const sourceDirectories: string[] = [];
  for (const dialectName of sources) {
    const dialect = getDialect(dialectName);
    if (!dialect) {
      const available = getKnownDirectories().join(", ");
      console.error(`\n  Error: Unknown source "${dialectName}". Available sources: ${available}.\n`);
      process.exit(1);
    }
    sourceDirectories.push(dialect.directory);
  }

  const existingDirs: string[] = [];
  const missingDirs: string[] = [];
  for (const dir of sourceDirectories) {
    const fullPath = path.join(projectDir, `.${dir}`);
    if (fs.existsSync(fullPath)) {
      existingDirs.push(dir);
    } else {
      missingDirs.push(dir);
    }
  }

  if (existingDirs.length === 0) {
    // All source directories are missing — error per PRD §8.3
    const dirList = sourceDirectories.map((d) => `.${d}/`).join(", ");
    console.error(
      `\n  Error: Source directory "${dirList}" not found in project.` +
      `\n  Run from a project with agent configuration or specify a different --source.\n`,
    );
    process.exit(1);
  }

  // Warn about missing dirs when some exist (multi-source partial miss)
  for (const dir of missingDirs) {
    console.warn(`  Warning: Source directory ".${dir}/" not found, skipping.`);
  }

  // 2. Scan project filtered to source dialects
  const scanResult = await scanProject(projectDir, { dialects: sources });

  // 3. Check for empty scan — warn but proceed (per PRD §8.3)
  const totalItems = scanResult.commands.length + scanResult.skills.length + scanResult.mcpServers.length;
  if (totalItems === 0) {
    console.warn("  Warning: No tasks, skills, or MCP servers found in source directories. Proceeding with empty project role.");
  }

  // 4. Deduplicate by name (first-wins) — scanProject iterates dialects in order
  const seenTasks = new Set<string>();
  const tasks: TaskRef[] = [];
  for (const cmd of scanResult.commands) {
    if (!seenTasks.has(cmd.name)) {
      seenTasks.add(cmd.name);
      tasks.push({ name: cmd.name });
    }
  }

  const seenSkills = new Set<string>();
  const skills: SkillRef[] = [];
  for (const skill of scanResult.skills) {
    if (!seenSkills.has(skill.name)) {
      seenSkills.add(skill.name);
      skills.push({ name: skill.name });
    }
  }

  const seenApps = new Set<string>();
  const apps: AppConfig[] = [];
  for (const server of scanResult.mcpServers) {
    if (!seenApps.has(server.name)) {
      seenApps.add(server.name);
      const app: AppConfig = {
        name: server.name,
        transport: server.url ? "sse" : "stdio",
        env: server.env ?? {},
        tools: { allow: [], deny: [] },
        credentials: [],
        location: "proxy",
      };
      if (server.command) app.command = server.command;
      if (server.args) app.args = server.args;
      if (server.url) app.url = server.url;
      apps.push(app);
    }
  }

  // 5. Build container.ignore.paths
  const ignorePaths: string[] = [];
  for (const dir of existingDirs) {
    ignorePaths.push(`.${dir}/`);
  }
  if (fs.existsSync(path.join(projectDir, ".env"))) {
    ignorePaths.push(".env");
  }

  // 6. Determine the primary source dialect for source.agentDialect
  const primaryDialect = sources[0];

  // 7. Build the Role object
  const sourceNames = sources
    .map((s) => getDialect(s)?.directory ?? s)
    .join(", ");

  const role: Role = {
    metadata: {
      name: "project",
      description: `Auto-generated from project's ${sourceNames} configuration`,
    },
    type: "project",
    instructions: "",
    tasks,
    skills,
    apps,
    sources: sources,
    container: {
      packages: { apt: [], npm: [], pip: [] },
      ignore: { paths: ignorePaths },
      mounts: [],
    },
    governance: { risk: "LOW", credentials: [] },
    resources: [],
    source: { type: "local", agentDialect: primaryDialect },
  };

  return role;
}

export function normalizeSourceFlags(sources: string[]): string[] {
  const normalized: string[] = [];
  for (const s of sources) {
    const resolved = resolveDialectName(s);
    if (!resolved) {
      const available = getKnownDirectories().join(", ");
      console.error(`\n  Error: Unknown source "${s}". Available sources: ${available}.\n`);
      process.exit(1);
    }
    normalized.push(resolved);
  }
  return normalized;
}

/**
 * Create the action handler for the `run` command.
 */
function createRunAction(overrideRole?: string, overridePrompt?: string) {
  return async (
    positionalAgent: string | undefined,
    positionalPrompt: string | undefined,
    options: {
      acp?: boolean;
      bash?: boolean;
      terminal?: boolean;
      build?: boolean;
      verbose?: boolean;
      proxyOnly?: boolean;
      devContainer?: boolean;
      agent?: string;
      role?: string;
      home?: string;
      source?: string[];
      proxyPort: string;
      print?: string;
    },
  ) => {
    // Disambiguate positional args:
    // - When --agent is set AND positionalAgent is also set, treat positionalAgent as prompt
    // - Otherwise positionalAgent is the agent name and positionalPrompt is the prompt
    let agentPositional: string | undefined;
    let promptPositional: string | undefined;
    if (options.agent && positionalAgent) {
      agentPositional = undefined;
      promptPositional = positionalAgent;
    } else {
      agentPositional = positionalAgent;
      promptPositional = positionalPrompt;
    }

    const agentInput = agentPositional ?? options.agent;
    const initialPrompt = options.print ?? promptPositional ?? overridePrompt;
    const isPrintMode = !!options.print;
    const projectDir = process.cwd();

    // Auto-init .mason/config.json when an agent name is provided
    if (agentInput) {
      ensureMasonConfig(projectDir);
    }

    // Alias resolution: check aliases first (alias takes precedence over agent name)
    const aliasEntry = agentInput ? loadConfigAliasEntry(projectDir, agentInput) : undefined;
    if (aliasEntry) {
      // Warn if the alias name collides with an agent key
      const directAgentEntry = agentInput ? loadConfigAgentEntry(projectDir, agentInput) : undefined;
      if (directAgentEntry) {
        console.warn(`[config] Alias "${agentInput}" shadows agent name "${agentInput}". The alias will be used.`);
      }
    }

    // Effective agent name: from alias reference, or the direct input
    const effectiveAgentInput = aliasEntry ? aliasEntry.agent : agentInput;

    // Runtime config: alias fields take precedence, fall back to agent config entry (deprecated)
    const configEntry = aliasEntry ?? (agentInput ? loadConfigAgentEntry(projectDir, agentInput) : undefined);

    // Derive effective role: override (for configure) > --role flag > config role > project role
    const role = overrideRole ?? options.role ?? configEntry?.role;

    if (options.bash && options.acp) {
      console.error("\n  --bash and --acp are mutually exclusive.\n");
      process.exit(1);
      return;
    }

    if (isPrintMode) {
      const conflicts = [
        options.acp && "--acp",
        options.bash && "--bash",
        options.devContainer && "--dev-container",
        options.proxyOnly && "--proxy-only",
      ].filter(Boolean);
      if (conflicts.length > 0) {
        console.error(`\n  -p/--print is mutually exclusive with ${conflicts.join(", ")}.\n`);
        process.exit(1);
        return;
      }
    }

    // Derive effective mode: explicit flags > config mode > terminal (default)
    const effectiveAcp =
      options.acp ||
      (!options.bash && !options.terminal && configEntry?.mode === "acp");
    const effectiveBash =
      options.bash ||
      (!options.acp && !options.terminal && configEntry?.mode === "bash");

    // Resolve agent type from effective agent name (after alias resolution)
    let resolvedAgentType: string | undefined;
    if (effectiveAgentInput) {
      resolvedAgentType = resolveAgentType(effectiveAgentInput);
      if (!resolvedAgentType) {
        const known = getKnownAgentTypeNames().join(", ");
        console.error(`\n  Unknown agent "${effectiveAgentInput}".\n  Available agents: ${known}\n`);
        process.exit(1);
        return;
      }
    }

    // ── Config Resolution (PRD §6.1) ─────────────────────────────────
    // After agent type is resolved, check if the agent declares a configSchema.
    // If so, resolve stored config, prompt for missing values, and persist.
    // Then derive llmConfig and dynamic credentials from the resolved values.
    let llmConfig: { provider: string; model: string } | undefined;
    let dynamicCredentialKeys: string[] = [];
    if (resolvedAgentType) {
      const agentPkg = getAgentFromRegistry(resolvedAgentType);
      if (agentPkg?.configSchema) {
        try {
          const storedConfig = getAgentConfig(projectDir, agentPkg.name);
          const { resolved, newValues } = await promptConfig(
            agentPkg.configSchema,
            storedConfig,
            agentPkg.name,
          );
          if (Object.keys(newValues).length > 0) {
            saveAgentConfig(projectDir, agentPkg.name, newValues);
          }

          // Derive LLM config from resolved values (if both provider and model are set)
          const provider = resolved["llm.provider"];
          const model = resolved["llm.model"];
          if (provider && model) {
            llmConfig = { provider, model };
          }

          // Resolve dynamic credentials from the agent's credentialsFn
          if (agentPkg.credentialsFn) {
            const creds = agentPkg.credentialsFn(resolved);
            dynamicCredentialKeys = creds.map((c) => c.key);
          }
        } catch (err) {
          if (err instanceof ConfigResolutionError) {
            console.error(`\n  ${err.message}\n`);
            process.exit(1);
            return;
          }
          throw err;
        }
      }
    }

    // Merge static credentials from config entry with dynamic credentials from credentialsFn
    const effectiveCredentials = [
      ...(configEntry?.credentials ?? []),
      ...dynamicCredentialKeys,
    ].filter((v, i, a) => a.indexOf(v) === i); // deduplicate

    // Derive effective home: --home flag > config home > undefined
    let homeOverride: string | undefined;
    const rawHome = options.home ?? configEntry?.home;
    if (rawHome) {
      homeOverride = expandHome(rawHome);
      if (!fs.existsSync(homeOverride)) {
        console.warn(`  Warning: agent home path "${rawHome}" does not exist. The mount will be empty.`);
      }
    }

    // agent-args from alias config (undefined if not an alias or no agent-args set)
    const agentArgs = aliasEntry?.agentArgs;

    // Normalize --source flags: validate against dialect registry and convert to registry keys
    const sourceOverride = options.source?.length
      ? normalizeSourceFlags(options.source)
      : undefined;

    // Generate project role when no explicit role is provided
    let preResolvedRole: Role | undefined;
    if (!role) {
      // Determine sources: --source flags take precedence, else derive from agent type
      const effectiveSources = sourceOverride ?? (() => {
        if (resolvedAgentType) {
          const dialectName = resolveDialectName(resolvedAgentType);
          if (dialectName) return [dialectName];
        }
        return [];
      })();

      if (effectiveSources.length === 0) {
        console.error(
          "\n  --role <name> is required (or set \"role\" in .mason/config.json for this agent or alias).\n" +
          "  Usage: mason run --role <name> [--agent <name>]\n",
        );
        process.exit(1);
        return;
      }

      preResolvedRole = await generateProjectRole(projectDir, effectiveSources);
    }

    // Effective role name: explicit role name or "project" for auto-generated
    const effectiveRoleName = role ?? "project";

    if (options.proxyOnly) {
      await runProxyOnly(projectDir, resolvedAgentType, effectiveRoleName, parseInt(options.proxyPort, 10), undefined, preResolvedRole);
    } else if (effectiveAcp) {
      await runAgent(projectDir, resolvedAgentType, effectiveRoleName, undefined, {
        acp: true,
        proxyPort: parseInt(options.proxyPort, 10),
        homeOverride,
        agentConfigCredentials: effectiveCredentials.length > 0 ? effectiveCredentials : undefined,
        agentArgs,
        sourceOverride,
        preResolvedRole,
        llmConfig,
        // initialPrompt intentionally omitted for ACP mode
      });
    } else if (options.devContainer) {
      await runAgent(projectDir, resolvedAgentType, effectiveRoleName, undefined, {
        devContainer: true,
        proxyPort: parseInt(options.proxyPort, 10),
        build: options.build,
        verbose: options.verbose,
        homeOverride,
        devContainerCustomizations: (configEntry as { devContainerCustomizations?: DevContainerCustomizations } | undefined)?.devContainerCustomizations,
        agentConfigCredentials: effectiveCredentials.length > 0 ? effectiveCredentials : undefined,
        agentArgs,
        sourceOverride,
        preResolvedRole,
        initialPrompt,
        llmConfig,
      });
    } else if (isPrintMode) {
      await runAgent(projectDir, resolvedAgentType, effectiveRoleName, undefined, {
        printMode: true,
        proxyPort: parseInt(options.proxyPort, 10),
        build: options.build,
        verbose: options.verbose,
        homeOverride,
        agentConfigCredentials: effectiveCredentials.length > 0 ? effectiveCredentials : undefined,
        agentArgs,
        sourceOverride,
        preResolvedRole,
        initialPrompt,
        llmConfig,
      });
    } else {
      await runAgent(projectDir, resolvedAgentType, effectiveRoleName, undefined, {
        proxyPort: parseInt(options.proxyPort, 10),
        bash: effectiveBash,
        build: options.build,
        verbose: options.verbose,
        homeOverride,
        agentConfigCredentials: effectiveCredentials.length > 0 ? effectiveCredentials : undefined,
        agentArgs,
        sourceOverride,
        preResolvedRole,
        initialPrompt,
        llmConfig,
      });
    }
  };
}

export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description("Run a role on the specified agent runtime")
    .argument("[agent]", "Agent name from config or built-in type (e.g., claude, pi, mcp)")
    .argument("[prompt]", "Initial prompt passed to the agent as the first message")
    .option("--acp", "Start in ACP mode for editor integration")
    .option("--bash", "Launch bash shell instead of the agent (for debugging)")
    .option("--terminal", "Force terminal (interactive) mode, overriding config mode")
    .option("--build", "Force rebuild Docker images before running")
    .option("--role <name>", "Role name to run")
    .option("--agent <name>", "Agent name from .mason/config.json or built-in alias")
    .option("--home <path>", "Bind-mount path over /home/mason/ in the agent container")
    .option("--dev-container", "Start in dev-container mode: print IDE attach instructions and optionally launch VSCode")
    .option("--proxy-only", "Start proxy infrastructure only, output connection info as JSON")
    .option("--verbose", "Show Docker build and compose output")
    .option("--proxy-port <number>", "Internal proxy port (default: 3000)", "3000")
    .option("-p, --print <prompt>", "Run in print mode: execute prompt non-interactively, output response only")
    .addOption(
      new Option("--source <name>", "Agent source directory to scan (repeatable). Overrides role sources.")
        .argParser((value: string, previous: string[] | undefined) => [...(previous ?? []), value]),
    )
    .addHelpText("after", RUN_ACP_AGENT_HELP_EPILOG)
    .action(createRunAction());
}

const CONFIGURE_ROLE = "@clawmasons/role-configure-project";
const CONFIGURE_PROMPT = "create and implement role plan";

export function registerConfigureCommand(program: Command): void {
  program
    .command("configure")
    .description("Configure a project for mason (alias for run with the configure-project role)")
    .argument("[agent]", "Agent name from config or built-in type (e.g., claude, pi, mcp)")
    .argument("[prompt]", "Initial prompt (defaults to \"create and implement role plan\")")
    .option("--acp", "Start in ACP mode for editor integration")
    .option("--bash", "Launch bash shell instead of the agent (for debugging)")
    .option("--terminal", "Force terminal (interactive) mode, overriding config mode")
    .option("--build", "Force rebuild Docker images before running")
    .option("--agent <name>", "Agent name from .mason/config.json or built-in alias")
    .option("--home <path>", "Bind-mount path over /home/mason/ in the agent container")
    .option("--dev-container", "Start in dev-container mode: print IDE attach instructions and optionally launch VSCode")
    .option("--proxy-only", "Start proxy infrastructure only, output connection info as JSON")
    .option("--verbose", "Show Docker build and compose output")
    .option("--proxy-port <number>", "Internal proxy port (default: 3000)", "3000")
    .action(createRunAction(CONFIGURE_ROLE, CONFIGURE_PROMPT));
}

// ── Main Orchestrator ─────────────────────────────────────────────────

export async function runAgent(
  projectDir: string,
  agent: string | undefined,
  role: string,
  deps?: RunAgentDeps,
  acpOptions?: {
    acp?: boolean;
    proxyPort?: number;
    bash?: boolean;
    build?: boolean;
    verbose?: boolean;
    homeOverride?: string;
    devContainer?: boolean;
    devContainerCustomizations?: DevContainerCustomizations;
    agentConfigCredentials?: string[];
    agentArgs?: string[];
    sourceOverride?: string[];
    initialPrompt?: string;
    preResolvedRole?: Role;
    llmConfig?: { provider: string; model: string };
    printMode?: boolean;
  },
): Promise<void> {
  // Initialize agent registry with config-declared agents from .mason/config.json
  const initRegistryFn = deps?.initRegistryFn ?? initRegistry;
  await initRegistryFn(projectDir);

  // Pre-flight: check Docker Compose is available before any mode-specific work
  const checkDocker = deps?.checkDockerComposeFn ?? checkDockerCompose;
  try {
    checkDocker();
  } catch (err) {
    console.error(`\n  ${(err as Error).message}\n`);
    process.exit(1);
    return;
  }

  // Silent housekeeping: remove stopped containers, dangling images, orphaned sessions
  try {
    await quickAutoCleanup(projectDir);
  } catch (cleanupErr) {
    // Cleanup failures should never block the run
    console.warn(`  Warning: auto-cleanup failed: ${(cleanupErr as Error).message}`);
  }

  const isAcpMode = acpOptions?.acp === true;
  const isDevContainerMode = acpOptions?.devContainer === true;
  const proxyPort = acpOptions?.proxyPort ?? 3000;
  const bashMode = acpOptions?.bash === true;
  const buildMode = acpOptions?.build === true;
  const homeOverride = deps?.homeOverride ?? acpOptions?.homeOverride;
  const agentConfigCredentials = acpOptions?.agentConfigCredentials;
  const agentArgs = acpOptions?.agentArgs;
  const sourceOverride = acpOptions?.sourceOverride;
  const initialPrompt = acpOptions?.initialPrompt;
  const preResolvedRole = acpOptions?.preResolvedRole;
  const llmConfig = acpOptions?.llmConfig;
  const isPrintMode = acpOptions?.printMode === true;

  if (isAcpMode) {
    return runAgentAcpMode(projectDir, agent, role, proxyPort, deps, homeOverride, agentConfigCredentials, agentArgs, sourceOverride, preResolvedRole, llmConfig);
  } else if (isPrintMode) {
    const verbose = acpOptions?.verbose === true;
    return runAgentPrintMode(projectDir, agent, role, proxyPort, deps, buildMode, verbose, homeOverride, agentConfigCredentials, agentArgs, initialPrompt, sourceOverride, preResolvedRole, llmConfig);
  } else if (isDevContainerMode) {
    const verbose = acpOptions?.verbose === true;
    return runAgentDevContainerMode(
      projectDir, agent, role, proxyPort, deps, buildMode, verbose, homeOverride,
      acpOptions?.devContainerCustomizations,
      agentConfigCredentials,
      agentArgs,
      initialPrompt,
      sourceOverride,
      preResolvedRole,
      llmConfig,
    );
  } else {
    const verbose = acpOptions?.verbose === true;
    return runAgentInteractiveMode(projectDir, agent, role, proxyPort, deps, bashMode, buildMode, verbose, homeOverride, agentConfigCredentials, agentArgs, initialPrompt, sourceOverride, preResolvedRole, llmConfig);
  }
}

// ── Shared Helpers ────────────────────────────────────────────────────

/**
 * Collect declared credential keys from SDK defaults, agent config, role governance, and app-level.
 */
function collectDeclaredCredentialKeys(
  agentType: string,
  agentConfigCredentials: string[] | undefined,
  roleType: Role,
): string[] {
  const agentPkg = getAgentFromRegistry(agentType);
  const sdkCredKeys = agentPkg?.runtime?.credentials?.map((c) => c.key) ?? [];
  const keys = [...sdkCredKeys, ...(agentConfigCredentials ?? []), ...(roleType.governance?.credentials ?? [])];
  for (const app of roleType.apps ?? []) {
    for (const key of app.credentials ?? []) {
      if (!keys.includes(key)) {
        keys.push(key);
      }
    }
  }
  return keys;
}

/**
 * Merge dynamic agent-config credential keys into a ResolvedAgent so
 * they're included in `collectEnvCredentials` session overrides.
 */
function mergeAgentConfigCredentials(
  resolvedAgent: ResolvedAgent,
  agentConfigCredentials: string[] | undefined,
): void {
  if (agentConfigCredentials?.length) {
    for (const key of agentConfigCredentials) {
      if (!resolvedAgent.credentials.includes(key)) {
        resolvedAgent.credentials.push(key);
      }
    }
  }
}

/**
 * Regenerate agent-launch.json in the workspace directory.
 *
 * The workspace is live-mounted (not baked into the Docker image), so it's
 * safe to refresh every session without a full Docker rebuild.  This ensures
 * credential lists and launch args always reflect the current configuration.
 */
function refreshAgentLaunchJson(
  roleType: Role,
  agentType: string,
  dockerBuildDir: string,
  options?: {
    agentConfigCredentials?: string[];
    agentArgs?: string[];
    initialPrompt?: string;
    llmConfig?: { provider: string; model: string };
    printMode?: boolean;
  },
): void {
  try {
    const workspace = materializeForAgent(roleType, agentType, undefined, undefined, options);
    const launchJson = workspace.get("agent-launch.json");
    if (launchJson) {
      const workspaceDir = path.join(dockerBuildDir, agentType, "workspace");
      fs.mkdirSync(workspaceDir, { recursive: true });
      fs.writeFileSync(path.join(workspaceDir, "agent-launch.json"), launchJson);
    }
  } catch {
    // Best-effort: the initial build already created agent-launch.json.
    // If re-materialization fails (e.g., incomplete role schema), keep the
    // existing file rather than blocking the session.
  }
}

// ── Interactive Mode ──────────────────────────────────────────────────

async function runAgentInteractiveMode(
  projectDir: string,
  agentOverride: string | undefined,
  role: string,
  proxyPort: number,
  deps?: RunAgentDeps,
  bashMode?: boolean,
  buildMode?: boolean,
  verbose?: boolean,
  homeOverride?: string,
  agentConfigCredentials?: string[],
  agentArgs?: string[],
  initialPrompt?: string,
  sourceOverride?: string[],
  preResolvedRole?: Role,
  llmConfig?: { provider: string; model: string },
): Promise<void> {
  const execCompose = deps?.execComposeFn ?? execComposeCommand;
  const runAgent = deps?.runAgentFn ?? runAgentWithOciRestart;
  const ensureGitignore = deps?.ensureGitignoreEntryFn ?? ensureGitignoreEntry;
  const startHostProxy = deps?.startHostProxyFn ?? defaultStartHostProxy;
  const resolveRoleFn = deps?.resolveRoleFn ?? defaultResolveRole;
  const waitForProxyHealth = deps?.waitForProxyHealthFn ?? defaultWaitForProxyHealth;

  try {
    // 1. Resolve role from project directory (skip if pre-resolved)
    const roleType = preResolvedRole ?? await resolveRoleFn(role, projectDir);

    // 1b. Apply --source override if provided
    if (sourceOverride?.length) {
      roleType.sources = sourceOverride;
    }

    const roleName = getAppShortName(roleType.metadata.name);

    // 3. Infer or override agent type
    const agentType = agentOverride ?? inferAgentType(roleType, readDefaultAgent(projectDir));

    console.log(`\n  Agent: ${agentType}`);
    console.log(`  Role: ${roleName} (${roleType.type})`);
    console.log(`  Source: ${roleType.sources.length > 0 ? roleType.sources.join(", ") : "(none)"}`);

    // 4. Ensure docker build artifacts exist (auto-build if missing)
    const { dockerBuildDir, dockerDir } = await ensureDockerBuild(
      roleType, agentType, projectDir, { existsSyncFn: deps?.existsSyncFn, forceRebuild: buildMode, agentConfigCredentials, agentArgs, initialPrompt, llmConfig },
    );

    // 4b. Always refresh agent-launch.json (live-mounted, not baked into image)
    refreshAgentLaunchJson(roleType, agentType, dockerBuildDir, {
      agentConfigCredentials, agentArgs, initialPrompt, llmConfig,
    });

    // 5. Ensure .mason is in project's .gitignore
    ensureGitignore(projectDir, ".mason");

    // 5b. Pre-flight cleanup of stale Docker resources
    await quickAutoCleanup(projectDir);

    // 6. Create session directory with compose file
    const { uid, gid } = getHostIds();
    const declaredCredentialKeys = collectDeclaredCredentialKeys(agentType, agentConfigCredentials, roleType);
    const sessionIdOverride = (deps?.generateSessionIdFn ?? generateSessionId)();
    const session = createSessionDirectory({
      projectDir,
      dockerBuildDir,
      dockerDir,
      role: roleType,
      agentType,
      agentName: roleName,
      proxyPort,
      roleMounts: roleType.container?.mounts,
      credentialKeys: declaredCredentialKeys,
      hostUid: uid,
      hostGid: gid,
      homeOverride,
      bashMode,
      verbose,
      sessionId: sessionIdOverride,
      agentShortName: getAgentFromRegistry(agentType)?.aliases?.[0] ?? agentType,
    });

    const { sessionId, composeFile, relayToken, proxyServiceName, agentServiceName } = session;
    console.log(`  Session: ${sessionId}`);
    console.log(`  Compose: .mason/sessions/${sessionId}/docker-compose.yaml`);

    // 7. Build and start proxy detached
    console.log(`\n  Building proxy (${proxyServiceName})...`);

    const buildArgs = ["build"];
    if (buildMode) buildArgs.push("--no-cache");
    buildArgs.push(proxyServiceName);

    const buildCode = await execCompose(
      composeFile,
      buildArgs,
      { verbose },
    );
    if (buildCode !== 0) {
      throw new Error(`Failed to build proxy image (exit code ${buildCode}).`);
    }

    console.log(`  Starting proxy (${proxyServiceName})...`);

    const proxyCode = await execCompose(
      composeFile,
      ["up", "-d", proxyServiceName],
      { verbose, timeoutMs: 30_000 },
    );
    if (proxyCode !== 0) {
      throw new Error(`Failed to start proxy (exit code ${proxyCode}).`);
    }
    console.log(`  Proxy started in background.`);

    // 8b. Wait for proxy health before connecting credential service
    console.log(`  Waiting for proxy to be ready...`);
    await waitForProxyHealth(`http://localhost:${proxyPort}/health`, 60_000);
    console.log(`  Proxy ready.`);

    // 9. Collect env credentials, partition apps, and start host proxy in-process
    const adaptRoleFn = deps?.adaptRoleFn ?? defaultAdaptRole;
    const resolvedAgent = adaptRoleFn(roleType, agentType);
    if (llmConfig) resolvedAgent.llm = llmConfig;
    mergeAgentConfigCredentials(resolvedAgent, agentConfigCredentials);
    const envCredentials = collectEnvCredentials(resolvedAgent);
    const hostApps = resolvedAgent.roles.flatMap((r) => r.apps).filter((a) => a.location === "host");

    console.log(`  Starting host proxy (in-process)...`);

    let hostProxyHandle: { stop: () => Promise<void> } | null = null;
    try {
      hostProxyHandle = await startHostProxy({
        proxyPort,
        relayToken,
        envCredentials,
        hostApps: hostApps.length > 0 ? hostApps : undefined,
      });
      console.log(`  Host proxy connected to Docker proxy.`);
    } catch (err) {
      throw new Error(`Failed to start host proxy: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 10. Start agent interactively
    console.log(`  Starting agent (${agentServiceName})...\n`);

    // When stdin is not a TTY (e.g. piped from a test), pass -T to disable
    // pseudo-TTY allocation so docker compose run works with piped stdio.
    const runArgs = ["run", "--rm", "--service-ports", "--build"];
    if (!process.stdin.isTTY) {
      runArgs.push("-T");
    }
    runArgs.push(agentServiceName);

    const agentCode = await runAgent(composeFile, runArgs);

    // 11. Tear down all containers on agent exit
    console.log(`\n  Agent exited (code ${agentCode}). Tearing down services...`);

    try {
      if (hostProxyHandle) {
        await hostProxyHandle.stop();
      }
    } catch { /* best-effort */ }

    await execCompose(composeFile, ["down"], { verbose });

    console.log(`  Services stopped.`);
    console.log(`  Session retained at: .mason/sessions/${sessionId}/`);
    console.log(`\n  agent complete\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n  agent failed: ${message}\n`);
    process.exit(1);
  }
}

// ── Print Mode ────────────────────────────────────────────────────────

async function runAgentPrintMode(
  projectDir: string,
  agentOverride: string | undefined,
  role: string,
  proxyPort: number,
  deps?: RunAgentDeps,
  buildMode?: boolean,
  verbose?: boolean,
  homeOverride?: string,
  agentConfigCredentials?: string[],
  agentArgs?: string[],
  initialPrompt?: string,
  sourceOverride?: string[],
  preResolvedRole?: Role,
  llmConfig?: { provider: string; model: string },
): Promise<void> {
  const execCompose = deps?.execComposeFn ?? execComposeCommand;
  const ensureGitignore = deps?.ensureGitignoreEntryFn ?? ensureGitignoreEntry;
  const startHostProxy = deps?.startHostProxyFn ?? defaultStartHostProxy;
  const resolveRoleFn = deps?.resolveRoleFn ?? defaultResolveRole;
  const waitForProxyHealth = deps?.waitForProxyHealthFn ?? defaultWaitForProxyHealth;

  // Early log suppression: buffer console output until file logger is ready
  const origLog = console.log.bind(console);
  const origError = console.error.bind(console);
  const earlyBuffer: unknown[][] = [];
  console.log = (...args: unknown[]) => { earlyBuffer.push(args); };
  console.error = (...args: unknown[]) => { earlyBuffer.push(args); };

  let logger: { log(...args: unknown[]): void; error(...args: unknown[]): void; close(): void } | null = null;

  try {
    // 1. Resolve role
    const roleType = preResolvedRole ?? await resolveRoleFn(role, projectDir);
    if (sourceOverride?.length) {
      roleType.sources = sourceOverride;
    }

    const roleName = getAppShortName(roleType.metadata.name);
    const agentType = agentOverride ?? inferAgentType(roleType, readDefaultAgent(projectDir));

    console.log(`[print] Agent: ${agentType}`);
    console.log(`[print] Role: ${roleName} (${roleType.type})`);

    // 2. Ensure docker build artifacts (with printMode so -p and json stream args land in agent-launch.json)
    const { dockerBuildDir, dockerDir } = await ensureDockerBuild(
      roleType, agentType, projectDir, { existsSyncFn: deps?.existsSyncFn, forceRebuild: buildMode, agentConfigCredentials, agentArgs, initialPrompt, llmConfig, printMode: true },
    );

    // 2b. Always refresh agent-launch.json (live-mounted, not baked into image)
    refreshAgentLaunchJson(roleType, agentType, dockerBuildDir, {
      agentConfigCredentials, agentArgs, initialPrompt, llmConfig, printMode: true,
    });

    // 3. Create file logger and flush early buffer
    const sessionLogsDir = path.join(projectDir, ".mason", "logs");
    fs.mkdirSync(sessionLogsDir, { recursive: true });
    logger = createFileLogger(sessionLogsDir);

    for (const args of earlyBuffer) { logger.log(...args); }
    earlyBuffer.length = 0;
    const fileLogger = logger;
    console.log = (...args: unknown[]) => fileLogger.log(...args);
    console.error = (...args: unknown[]) => fileLogger.error(...args);

    // 4. Ensure .mason is in .gitignore
    ensureGitignore(projectDir, ".mason");
    await quickAutoCleanup(projectDir);

    // 5. Create session directory
    const { uid, gid } = getHostIds();
    const declaredCredentialKeys = collectDeclaredCredentialKeys(agentType, agentConfigCredentials, roleType);
    const sessionIdOverride = (deps?.generateSessionIdFn ?? generateSessionId)();
    const session = createSessionDirectory({
      projectDir,
      dockerBuildDir,
      dockerDir,
      role: roleType,
      agentType,
      agentName: roleName,
      proxyPort,
      roleMounts: roleType.container?.mounts,
      credentialKeys: declaredCredentialKeys,
      hostUid: uid,
      hostGid: gid,
      homeOverride,
      verbose,
      sessionId: sessionIdOverride,
      agentShortName: getAgentFromRegistry(agentType)?.aliases?.[0] ?? agentType,
    });

    const { sessionId, composeFile, relayToken, proxyServiceName, agentServiceName } = session;
    console.log(`[print] Session: ${sessionId}`);

    // 6. Build and start proxy
    const buildArgs = ["build"];
    if (buildMode) buildArgs.push("--no-cache");
    buildArgs.push(proxyServiceName);
    const buildCode = await execCompose(composeFile, buildArgs, { verbose });
    if (buildCode !== 0) throw new Error(`Failed to build proxy image (exit code ${buildCode}).`);

    const proxyCode = await execCompose(composeFile, ["up", "-d", proxyServiceName], { verbose, timeoutMs: 30_000 });
    if (proxyCode !== 0) throw new Error(`Failed to start proxy (exit code ${proxyCode}).`);

    await waitForProxyHealth(`http://localhost:${proxyPort}/health`, 60_000);
    console.log(`[print] Proxy ready.`);

    // 7. Start host proxy
    const adaptRoleFn = deps?.adaptRoleFn ?? defaultAdaptRole;
    const resolvedAgent = adaptRoleFn(roleType, agentType);
    if (llmConfig) resolvedAgent.llm = llmConfig;
    mergeAgentConfigCredentials(resolvedAgent, agentConfigCredentials);
    const envCredentials = collectEnvCredentials(resolvedAgent);
    const hostApps = resolvedAgent.roles.flatMap((r) => r.apps).filter((a) => a.location === "host");

    let hostProxyHandle: { stop: () => Promise<void> } | null = null;
    try {
      hostProxyHandle = await startHostProxy({
        proxyPort,
        relayToken,
        envCredentials,
        hostApps: hostApps.length > 0 ? hostApps : undefined,
      });
    } catch (err) {
      throw new Error(`Failed to start host proxy: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 8. Run agent with stream capture
    console.log(`[print] Starting agent (${agentServiceName})...`);

    const agentPkg = getAgentFromRegistry(agentType);
    const parseFinalResult = agentPkg?.printMode?.parseJsonStreamFinalResult;

    let finalResult: string | null = null;
    const runArgs = ["run", "--rm", "--service-ports", "--build", "-T", agentServiceName];
    const { code: agentCode } = await execComposeRunWithStreamCapture(composeFile, runArgs, (line) => {
      fileLogger.log(`[stream] ${line}`);
      if (parseFinalResult && finalResult === null) {
        try {
          finalResult = parseFinalResult(line);
        } catch (err) {
          fileLogger.error(`[stream] parse error: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    });

    // 9. Tear down
    console.log(`[print] Agent exited (code ${agentCode}). Tearing down...`);
    try { if (hostProxyHandle) await hostProxyHandle.stop(); } catch { /* best-effort */ }
    await execCompose(composeFile, ["down"], { verbose: false });

    // 10. Restore console and output result
    console.log = origLog;
    console.error = origError;
    fileLogger.close();
    logger = null;

    if (finalResult !== null) {
      const result = (finalResult as string).trim();
      process.stdout.write(result);
      if (!result.endsWith("\n")) process.stdout.write("\n");
    }

    if (agentCode !== 0) {
      process.exit(agentCode);
    }
  } catch (error) {
    // Restore console for error output
    console.log = origLog;
    console.error = origError;
    if (logger) logger.close();

    const message = error instanceof Error ? error.message : String(error);
    console.error(`agent failed: ${message}`);
    process.exit(1);
  }
}

// ── Dev-Container Mode ────────────────────────────────────────────────

/**
 * Build a VSCode attached-container URI for the given docker compose project and service.
 * Hex-encodes JSON config using Buffer (no shell dependency).
 */
export function buildVscodeAttachUri(containerName: string, workspacePath: string): string {
  const config = JSON.stringify({ containerName: `/${containerName}` });
  const hex = Buffer.from(config).toString("hex");
  return `vscode-remote://attached-container+${hex}${workspacePath}`;
}

/**
 * Derive the docker container name from a compose project name and service name.
 * Docker compose names containers as: <project>-<service>-<index>
 */
export function deriveContainerName(composeName: string, serviceShortName: string): string {
  return `${composeName}-${serviceShortName}-1`;
}

async function runAgentDevContainerMode(
  projectDir: string,
  agentOverride: string | undefined,
  role: string,
  proxyPort: number,
  deps?: RunAgentDeps,
  buildMode?: boolean,
  verbose?: boolean,
  homeOverride?: string,
  devContainerCustomizations?: DevContainerCustomizations,
  agentConfigCredentials?: string[],
  agentArgs?: string[],
  initialPrompt?: string,
  sourceOverride?: string[],
  preResolvedRole?: Role,
  llmConfig?: { provider: string; model: string },
): Promise<void> {
  const execCompose = deps?.execComposeFn ?? execComposeCommand;
  const ensureGitignore = deps?.ensureGitignoreEntryFn ?? ensureGitignoreEntry;
  const startHostProxy = deps?.startHostProxyFn ?? defaultStartHostProxy;
  const resolveRoleFn = deps?.resolveRoleFn ?? defaultResolveRole;
  const waitForProxyHealth = deps?.waitForProxyHealthFn ?? defaultWaitForProxyHealth;
  const adaptRoleFn = deps?.adaptRoleFn ?? defaultAdaptRole;

  try {
    // 1. Resolve role (skip if pre-resolved)
    const roleType = preResolvedRole ?? await resolveRoleFn(role, projectDir);

    // 1b. Apply --source override if provided
    if (sourceOverride?.length) {
      roleType.sources = sourceOverride;
    }

    const roleName = getAppShortName(roleType.metadata.name);
    const agentType = agentOverride ?? inferAgentType(roleType, readDefaultAgent(projectDir));

    console.log(`\n  Agent: ${agentType}`);
    console.log(`  Role: ${roleName}`);
    console.log(`  Source: ${roleType.sources.length > 0 ? roleType.sources.join(", ") : "(none)"}`);
    console.log(`  Mode: dev-container`);

    // 3. Ensure docker build artifacts
    const { dockerBuildDir, dockerDir } = await ensureDockerBuild(
      roleType, agentType, projectDir,
      { existsSyncFn: deps?.existsSyncFn, forceRebuild: buildMode, devContainerCustomizations, agentConfigCredentials, agentArgs, initialPrompt, llmConfig },
    );

    // 3b. Always refresh agent-launch.json (live-mounted, not baked into image)
    refreshAgentLaunchJson(roleType, agentType, dockerBuildDir, {
      agentConfigCredentials, agentArgs, initialPrompt, llmConfig,
    });

    // 4. Ensure .mason is in .gitignore
    ensureGitignore(projectDir, ".mason");

    // 5. Create vscode-server persistent directory and write static server-env-setup
    const vscodeServerHostPath = path.join(projectDir, ".mason", "docker", "vscode-server");
    fs.mkdirSync(vscodeServerHostPath, { recursive: true });

    const serverEnvSetupPath = path.join(vscodeServerHostPath, "server-env-setup");
    const serverEnvSetupContent = [
      "#!/bin/sh",
      "_LOG=/logs/server-env-setup.log",
      `echo "[$(date -u +%H:%M:%S)] server-env-setup: MCP_PROXY_TOKEN=\${MCP_PROXY_TOKEN:+set} MCP_PROXY_URL=\${MCP_PROXY_URL} AGENT_CREDENTIALS=\${AGENT_CREDENTIALS}" >> "$_LOG" 2>&1`,
      `_OUT=$(agent-entry cred-fetch 2>>"$_LOG")`,
      "_EXIT=$?",
      `echo "[$(date -u +%H:%M:%S)] cred-fetch exit=$_EXIT output_len=\${#_OUT}" >> "$_LOG"`,
      `if [ "$_EXIT" -eq 0 ]; then`,
      `  eval "$_OUT"`,
      `  echo "[$(date -u +%H:%M:%S)] CLAUDE_CODE_OAUTH_TOKEN=\${CLAUDE_CODE_OAUTH_TOKEN:+set}" >> "$_LOG"`,
      "fi",
      "",
    ].join("\n");
    if (!fs.existsSync(serverEnvSetupPath) ||
        fs.readFileSync(serverEnvSetupPath, "utf-8") !== serverEnvSetupContent) {
      fs.writeFileSync(serverEnvSetupPath, serverEnvSetupContent, { mode: 0o755 });
    }

    // 5b. Pre-flight cleanup of stale Docker resources
    await quickAutoCleanup(projectDir);

    // 6. Create session directory with compose file
    const { uid, gid } = getHostIds();
    const declaredCredentialKeys = collectDeclaredCredentialKeys(agentType, agentConfigCredentials, roleType);
    const sessionIdOverride = (deps?.generateSessionIdFn ?? generateSessionId)();
    const session = createSessionDirectory({
      projectDir,
      dockerBuildDir,
      dockerDir,
      role: roleType,
      agentType,
      agentName: roleName,
      proxyPort,
      roleMounts: roleType.container?.mounts,
      credentialKeys: declaredCredentialKeys,
      hostUid: uid,
      hostGid: gid,
      homeOverride,
      vscodeServerHostPath,
      verbose,
      sessionId: sessionIdOverride,
      agentShortName: getAgentFromRegistry(agentType)?.aliases?.[0] ?? agentType,
    });

    const { sessionId, composeFile, relayToken, proxyServiceName, agentServiceName } = session;

    // Derive compose project name for container name (VSCode attach)
    const projectHash = crypto.createHash("sha256").update(projectDir).digest("hex").slice(0, 8);
    const composeName = `mason-${projectHash}`;
    const containerName = deriveContainerName(composeName, agentServiceName);

    console.log(`  Session: ${sessionId}`);
    console.log(`  Compose: .mason/sessions/${sessionId}/docker-compose.yaml`);

    // 7. Build and start proxy
    console.log(`\n  Building proxy (${proxyServiceName})...`);
    const buildArgs = ["build"];
    if (buildMode) buildArgs.push("--no-cache");
    buildArgs.push(proxyServiceName);
    const buildCode = await execCompose(composeFile, buildArgs, { verbose });
    if (buildCode !== 0) throw new Error(`Failed to build proxy image (exit code ${buildCode}).`);

    const proxyCode = await execCompose(composeFile, ["up", "-d", proxyServiceName], { verbose, timeoutMs: 30_000 });
    if (proxyCode !== 0) throw new Error(`Failed to start proxy (exit code ${proxyCode}).`);
    console.log(`  Proxy started.`);

    await waitForProxyHealth(`http://localhost:${proxyPort}/health`, 60_000);
    console.log(`  Proxy ready.`);

    // 9. Start host proxy
    const resolvedAgent = adaptRoleFn(roleType, agentType);
    if (llmConfig) resolvedAgent.llm = llmConfig;
    mergeAgentConfigCredentials(resolvedAgent, agentConfigCredentials);
    const envCredentials = collectEnvCredentials(resolvedAgent);
    const hostAppsDevContainer = resolvedAgent.roles.flatMap((r) => r.apps).filter((a) => a.location === "host");
    const hostProxyHandle = await startHostProxy({
      proxyPort,
      relayToken,
      envCredentials,
      hostApps: hostAppsDevContainer.length > 0 ? hostAppsDevContainer : undefined,
    });
    console.log(`  Host proxy connected.`);

    // 10. Build and start agent container in background (detached)
    console.log(`\n  Building agent (${agentServiceName})...`);
    const agentBuildArgs = ["build"];
    if (buildMode) agentBuildArgs.push("--no-cache");
    agentBuildArgs.push(agentServiceName);
    const agentBuildCode = await execCompose(composeFile, agentBuildArgs, { verbose });
    if (agentBuildCode !== 0) throw new Error(`Failed to build agent image (exit code ${agentBuildCode}).`);

    const agentUpCode = await execCompose(composeFile, ["up", "-d", agentServiceName], { verbose });
    if (agentUpCode !== 0) throw new Error(`Failed to start agent container (exit code ${agentUpCode}).`);
    console.log(`  Agent container started.`);

    // 11. Print IDE connection instructions
    console.log(`
  ┌─────────────────────────────────────────────────────────────┐
  │  Dev-Container Ready                                        │
  ├─────────────────────────────────────────────────────────────┤
  │  Container:  ${containerName.padEnd(47)}│
  │  Workspace:  /home/mason/workspace/project                  │
  │                                                             │
  │  To attach from any dev-container-compatible IDE:           │
  │    1. Open the Remote Explorer                              │
  │    2. Select "Attach to Running Container"                  │
  │    3. Choose: ${containerName.padEnd(46)}│
  │                                                             │
  │  Press Ctrl+C to stop the session                           │
  └─────────────────────────────────────────────────────────────┘
`);

    // 12. Prompt to launch VSCode
    await promptAndLaunchVscode(containerName, "/home/mason/workspace/project");

    // 13. Stay alive until Ctrl+C
    console.log(`  Session running. Press Ctrl+C to tear down.\n`);
    await new Promise<void>((resolve) => {
      const onSignal = () => resolve();
      process.once("SIGINT", onSignal);
      process.once("SIGTERM", onSignal);
    });

    // 14. Tear down
    console.log(`\n  Tearing down services...`);
    try { await hostProxyHandle.stop(); } catch { /* best-effort */ }
    await execCompose(composeFile, ["down"], { verbose });
    console.log(`  Services stopped.`);
    console.log(`  Session retained at: .mason/sessions/${sessionId}/`);
    console.log(`\n  dev-container session complete\n`);

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n  dev-container failed: ${message}\n`);
    process.exit(1);
  }
}

/**
 * Prompt the user to optionally launch VSCode and attach to the running container.
 * Spawns `code --folder-uri` if the user confirms and `code` is on PATH.
 */
async function promptAndLaunchVscode(containerName: string, workspacePath: string): Promise<void> {
  const readline = await import("node:readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  await new Promise<void>((resolve) => {
    rl.question("  Would you like to launch VSCode and attach to the container? (y/N) ", (answer) => {
      rl.close();
      if (answer.toLowerCase() !== "y") {
        resolve();
        return;
      }

      const uri = buildVscodeAttachUri(containerName, workspacePath);
      const child = spawn("code", ["--folder-uri", uri], {
        detached: true,
        stdio: "ignore",
      });
      child.on("error", () => {
        console.error(`\n  VSCode (\`code\`) not found on PATH — attach manually using the instructions above.\n`);
      });
      child.unref();
      resolve();
    });
  });
}

// ── Proxy-Only Mode ───────────────────────────────────────────────────

/**
 * Start only the proxy infrastructure (no agent, no credential service).
 * Outputs connection info as JSON to stdout and returns.
 */
export async function runProxyOnly(
  projectDir: string,
  agentOverride: string | undefined,
  role: string,
  proxyPort: number,
  deps?: RunAgentDeps,
  preResolvedRole?: Role,
): Promise<void> {
  const execCompose = deps?.execComposeFn ?? execComposeCommand;
  const ensureGitignore = deps?.ensureGitignoreEntryFn ?? ensureGitignoreEntry;
  const resolveRoleFn = deps?.resolveRoleFn ?? defaultResolveRole;

  // Redirect console.log to stderr so only JSON goes to stdout
  const origLog = console.log;
  console.log = (...args: unknown[]) => console.error(...args);

  try {
  // 1. Resolve role from project directory (skip if pre-resolved)
  const roleType = preResolvedRole ?? await resolveRoleFn(role, projectDir);
  const roleName = getAppShortName(roleType.metadata.name);

  // 3. Infer or override agent type
  const agentType = agentOverride ?? inferAgentType(roleType, readDefaultAgent(projectDir));

  // 4. Ensure docker build artifacts exist (auto-build if missing)
  const { dockerBuildDir, dockerDir } = await ensureDockerBuild(
    roleType, agentType, projectDir, { existsSyncFn: deps?.existsSyncFn },
  );

  // 5. Ensure .mason is in project's .gitignore
  ensureGitignore(projectDir, ".mason");

  // 6. Create session directory with compose file
  const { uid, gid } = getHostIds();
  const sessionIdOverride = (deps?.generateSessionIdFn ?? generateSessionId)();
  const session = createSessionDirectory({
    projectDir,
    dockerBuildDir,
    dockerDir,
    role: roleType,
    agentType,
    agentName: roleName,
    proxyPort,
    roleMounts: roleType.container?.mounts,
    hostUid: uid,
    hostGid: gid,
    sessionId: sessionIdOverride,
    agentShortName: getAgentFromRegistry(agentType)?.aliases?.[0] ?? agentType,
  });

  const { sessionId, composeFile, proxyToken, proxyServiceName } = session;

  // 7. Build and start proxy detached
  const buildCode = await execCompose(composeFile, ["build", proxyServiceName]);
  if (buildCode !== 0) {
    throw new Error(`Failed to build proxy image (exit code ${buildCode}).`);
  }

  const upCode = await execCompose(composeFile, ["up", "-d", proxyServiceName]);
  if (upCode !== 0) {
    throw new Error(`Failed to start proxy (exit code ${upCode}).`);
  }

  // 9. Output connection info as JSON to stdout
  const info = {
    proxyPort,
    proxyToken,
    composeFile,
    proxyServiceName,
    sessionId,
  };
  origLog(JSON.stringify(info));

  } finally {
    console.log = origLog;
  }
}

// ── ACP Mode ──────────────────────────────────────────────────────────

async function runAgentAcpMode(
  projectDir: string,
  agentOverride: string | undefined,
  role: string,
  proxyPort: number,
  deps?: RunAgentDeps,
  homeOverride?: string,
  agentConfigCredentials?: string[],
  agentArgs?: string[],
  sourceOverride?: string[],
  preResolvedRole?: Role,
  llmConfig?: { provider: string; model: string },
  // initialPrompt is intentionally omitted: ACP mode does not forward initial prompts
): Promise<void> {
  const resolveRoleFn = deps?.resolveRoleFn ?? defaultResolveRole;
  const adaptRoleFn = deps?.adaptRoleFn ?? defaultAdaptRole;
  const createSession = deps?.createSessionFn ?? ((config: AcpSessionConfig, sessionDeps?: AcpSessionDeps) => new AcpSession(config, sessionDeps));
  const createBridge = deps?.createBridgeFn ?? ((config: AcpSdkBridgeConfig) => new AcpSdkBridge(config));
  const ensureGitignore = deps?.ensureGitignoreEntryFn ?? ensureGitignoreEntry;
  const mkdirSync = deps?.mkdirSyncFn ?? fs.mkdirSync;

  // ── Protect stdout from console pollution ────────────────────────────
  const origLog = console.log.bind(console);
  const origError = console.error.bind(console);
  const earlyBuffer: unknown[][] = [];
  if (!deps?.createLoggerFn) {
    const noop = (...args: unknown[]) => { earlyBuffer.push(args); };
    console.log = noop;
    console.error = noop;
  }

  let logger: AcpLogger | null = null;

  let session: AcpSession | null = null;
  let bridge: AcpSdkBridge | null = null;
  let hostProxyHandle: { stop: () => Promise<void> } | null = null;
  let shuttingDown = false;

  // Graceful shutdown handler
  const shutdown = async () => {
    shuttingDown = true;
    process.exitCode = 0;
    console.log = origLog;
    console.error = origError;
    const log = logger ?? { log: origError, error: origError, close: () => {} };
    log.log("\n[mason agent --acp] Shutting down...");
    try {
      if (bridge) await bridge.stop();
    } catch { /* best-effort */ }
    try {
      if (hostProxyHandle) await hostProxyHandle.stop();
    } catch { /* best-effort */ }
    try { log.close(); } catch { /* best-effort */ }
    try {
      if (session) await session.stop();
    } catch { /* best-effort */ }
    process.exit(0);
  };

  const onSignal = () => void shutdown();
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  try {
    // ── Step 1: Resolve role from project directory (skip if pre-resolved) ──
    const roleType = preResolvedRole ?? await resolveRoleFn(role, projectDir);

    // ── Step 1b: Apply --source override if provided ─────────────────
    if (sourceOverride?.length) {
      roleType.sources = sourceOverride;
    }

    const roleName = getAppShortName(roleType.metadata.name);

    // ── Step 2: Infer or override agent type ─────────────────────────
    const agentType = agentOverride ?? inferAgentType(roleType, readDefaultAgent(projectDir));

    // ── Step 3: Ensure docker build artifacts ────────────────────────
    const { dockerBuildDir, dockerDir } = await ensureDockerBuild(
      roleType, agentType, projectDir, { existsSyncFn: deps?.existsSyncFn, agentConfigCredentials, agentArgs, llmConfig },
    );

    // ── Step 3b: Always refresh agent-launch.json (live-mounted) ────
    refreshAgentLaunchJson(roleType, agentType, dockerBuildDir, {
      agentConfigCredentials, agentArgs, llmConfig,
    });

    // ── Create file logger in session-local logs ─────────────────────
    const sessionLogsDir = path.join(projectDir, ".mason", "logs");
    mkdirSync(sessionLogsDir, { recursive: true });
    const makeLogger = deps?.createLoggerFn ?? createFileLogger;
    logger = makeLogger(sessionLogsDir);

    // Flush buffered early output to the file logger.
    for (const args of earlyBuffer) { logger.log(...args); }
    earlyBuffer.length = 0;

    if (!deps?.createLoggerFn) {
      const fileLogger = logger;
      console.log = (...args: unknown[]) => fileLogger.log(...args);
      console.error = (...args: unknown[]) => fileLogger.error(...args);
    }

    // Ensure .mason is in project's .gitignore
    ensureGitignore(projectDir, ".mason");

    // ── Step 4: Resolve agent from role ──────────────────────────────
    logger.log(`[mason run --acp] Resolving role "${role}" for agent type "${agentType}"...`);
    const resolvedAgent = adaptRoleFn(roleType, agentType);
    if (llmConfig) resolvedAgent.llm = llmConfig;
    mergeAgentConfigCredentials(resolvedAgent, agentConfigCredentials);

    // ── Step 5: Compute tool filters ─────────────────────────────────
    const toolFilters = computeToolFilters(resolvedAgent);
    const toolCount = Object.keys(toolFilters).length;

    // ── Step 5b: Collect env credentials ─────────────────────────────
    const envCredentials = collectEnvCredentials(resolvedAgent);
    const envCredCount = Object.keys(envCredentials).length;

    logger.log(`[mason agent --acp] Agent: ${resolvedAgent.name}`);
    logger.log(`[mason agent --acp] Role: ${roleName}`);
    logger.log(`[mason agent --acp] Source: ${roleType.sources.length > 0 ? roleType.sources.join(", ") : "(none)"}`);
    logger.log(`[mason agent --acp] Tool filters: ${toolCount} app(s)`);
    if (envCredCount > 0) {
      logger.log(`[mason agent --acp] Env credentials: ${envCredCount} key(s) from process.env`);
    }

    // ── Step 6: Create session and start infrastructure ──────────────
    const runtime = resolvedAgent.runtimes[0] ?? "node";
    const agentPkg = getAgentFromRegistry(runtime);
    const acpRuntimeCmd = agentPkg?.acp?.command;
    const acpCommand = acpRuntimeCmd
      ? [...acpRuntimeCmd.split(" ").slice(1)]
      : undefined;

    const sdkCredKeys = agentPkg?.runtime?.credentials?.map((c) => c.key) ?? [];
    const declaredCredentialKeys = new Set<string>([...sdkCredKeys, ...(agentConfigCredentials ?? []), ...resolvedAgent.credentials]);
    for (const agentRole of resolvedAgent.roles) {
      for (const app of agentRole.apps) {
        for (const key of app.credentials) {
          declaredCredentialKeys.add(key);
        }
      }
    }

    // dtg: investigate whay the credential keys are being passed here, would expect them to be 
    //.     accessed via the credential service only
    session = createSession({
      projectDir,
      agent: resolvedAgent.slug,
      role: roleName,
      proxyPort,
      acpCommand,
      credentialKeys: [...declaredCredentialKeys],
      dockerBuildDir,
      dockerDir,
    }, { logger });

    logger.log("[mason agent --acp] Starting infrastructure (proxy)...");
    const infraInfo = await session.startInfrastructure();
    logger.log(`[mason agent --acp] Infrastructure started (${infraInfo.sessionId})`);

    // ── Step 6b: Start host proxy in-process ──────────────────────────
    logger.log("[mason agent --acp] Starting host proxy (in-process)...");
    const startHostProxy = deps?.startHostProxyFn ?? defaultStartHostProxy;
    const hostAppsAcp = resolvedAgent.roles.flatMap((r) => r.apps).filter((a) => a.location === "host");

    hostProxyHandle = await startHostProxy({
      proxyPort,
      relayToken: infraInfo.relayToken,
      envCredentials,
      hostApps: hostAppsAcp.length > 0 ? hostAppsAcp : undefined,
    });
    logger.log("[mason agent --acp] Host proxy connected to Docker proxy.");

    // ── Step 7: Create and start ACP SDK bridge ──────────────────────
    const logRef = logger;
    const sessionRef = session;

    bridge = createBridge({
      onSessionNew: async (cwd: string) => {
        logRef.log(`[mason agent --acp] session/new received — cwd: "${cwd}"`);

        const masonDir = path.join(cwd, ".mason");
        mkdirSync(masonDir, { recursive: true });

        ensureGitignore(cwd, ".mason");

        logRef.log("[mason agent --acp] Starting agent container...");
        const { child } = await sessionRef.startAgentProcess(cwd);
        logRef.log("[mason agent --acp] Agent process started.");

        return child;
      },
      logger,
    });

    // Start bridge with editor-facing streams (process stdin/stdout)
    const editorInput = Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>;
    const editorOutput = Writable.toWeb(process.stdout) as WritableStream<Uint8Array>;
    bridge.start(editorInput, editorOutput);

    logger.log(
      `\n[mason agent --acp] Ready -- stdio transport active\n` +
      `  Agent:      ${resolvedAgent.name}\n` +
      `  Role:       ${roleName}\n` +
      `  Source:     ${roleType.sources.length > 0 ? roleType.sources.join(", ") : "(none)"}\n` +
      `  Proxy port: ${proxyPort}\n` +
      `  Mode:       deferred (agent starts on session/new)\n`,
    );

    // Keep process alive until the editor disconnects.
    await bridge.closed;

  } catch (error) {
    if (shuttingDown) return;

    console.log = origLog;
    console.error = origError;
    const message = error instanceof Error ? error.message : String(error);
    const log = logger ?? { log: origError, error: origError, close: () => {} };
    log.error(`\n[mason agent --acp] Failed: ${message}\n`);

    try { if (bridge) await bridge.stop(); } catch { /* best-effort */ }
    try { if (session) await session.stop(); } catch { /* best-effort */ }
    try { log.close(); } catch { /* best-effort */ }
    process.exit(1);
  }
}

// ── Default proxy health check ─────────────────────────────────────────

async function defaultWaitForProxyHealth(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(url);
      if (resp.ok) return;
    } catch { /* not ready yet */ }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`Proxy health endpoint did not become ready within ${timeoutMs}ms`);
}

// ── Default host proxy startup ─────────────────────────────────────────

async function defaultStartHostProxy(opts: {
  proxyPort: number;
  relayToken: string;
  envCredentials: Record<string, string>;
  hostApps?: ResolvedApp[];
}): Promise<{ stop: () => Promise<void> }> {
  const hostProxy = new HostProxy({
    relayUrl: `ws://localhost:${opts.proxyPort}/ws/relay`,
    token: opts.relayToken,
    keychainService: "mason",
    envCredentials: opts.envCredentials,
    hostApps: opts.hostApps,
  });
  await hostProxy.start();
  return { stop: () => hostProxy.stop() };
}
