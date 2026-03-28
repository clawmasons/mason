import { type Command, Option } from "commander";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkDockerCompose } from "./docker-utils.js";
import { quickAutoCleanup } from "./doctor.js";
import { ensureGitignoreEntry } from "../../runtime/gitignore.js";
import type { ResolvedAgent, ResolvedApp, Role, AppConfig, TaskRef, SkillRef } from "@clawmasons/shared";
import { resolveRole as resolveRoleByName, adaptRoleToResolvedAgent, getAppShortName, resolveDialectName, getKnownDirectories, scanProject, getDialect, createSession as createMetaSession, readSession, resolveLatestSession, listSessions, updateSession } from "@clawmasons/shared";
import { getAgentFromRegistry, getAgentFromRegistryWithAutoInstall, initRegistry, getAllRegisteredNames, BUILTIN_AGENTS, materializeForAgent } from "../../materializer/role-materializer.js";
import { loadConfigAgentEntry, loadConfigAliasEntry, getAgentConfig, saveAgentConfig, readDefaultAgent, resolveAgentPackageName } from "@clawmasons/agent-sdk";
import { promptConfig, ConfigResolutionError } from "../../config/prompt-config.js";
import { HostProxy } from "@clawmasons/proxy";
import { createFileLogger, type FileLogger } from "../../utils/file-logger.js";
import { generateRoleDockerBuildDir, createSessionDirectory, getHostIds } from "../../materializer/docker-generator.js";
import { ensureProxyDependencies, synthesizeRolePackages } from "../../materializer/proxy-dependencies.js";
import { validateSessionUpdate as validateAcpUpdate } from "../../acp/validate-session-update.js";

// ── Local type alias (mirrors DevContainerCustomizations from agent-sdk) ──────
type DevContainerCustomizations = { vscode?: { extensions?: string[]; settings?: Record<string, unknown> } };

// ── CLI Version ───────────────────────────────────────────────────────

/** Read the CLI package version lazily (cached after first call). */
let _cliVersion: string | undefined;
function getCliVersion(): string {
  if (!_cliVersion) {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.join(__dirname, "../../../package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { version: string };
    _cliVersion = pkg.version;
  }
  return _cliVersion;
}

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
 * Resolve agent type with auto-install fallback.
 *
 * Tries the synchronous registry first. If not found, attempts to
 * auto-install the agent package and re-discover it.
 */
export async function resolveAgentTypeWithAutoInstall(input: string): Promise<string | undefined> {
  const agentPkg = await getAgentFromRegistryWithAutoInstall(input);
  return agentPkg?.name;
}

/**
 * Check whether a string matches a known agent type (including aliases).
 */
export function isKnownAgentType(input: string): boolean {
  // Check the synchronous registry first (built-ins + discovered)
  if (resolveAgentType(input) !== undefined) return true;
  // Also check if the name can be resolved to an installable package
  return resolveAgentPackageName(input) !== null;
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
  opts?: { interactive?: boolean; verbose?: boolean; timeoutMs?: number; logger?: FileLogger },
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
      ? (opts?.logger
        ? spawn("docker", baseArgs, { stdio: ["ignore", "pipe", "pipe"] })
        : spawn("docker", baseArgs, { stdio: "inherit" }))
      : spawn("docker", baseArgs, { stdio: ["ignore", "ignore", "pipe"] });

    if (showOutput && opts?.logger) {
      child.stdout?.on("data", (chunk: Buffer) => { opts.logger?.log(chunk.toString().trimEnd()); });
      child.stderr?.on("data", (chunk: Buffer) => { opts.logger?.error(chunk.toString().trimEnd()); });
    }

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

// ── Proxy port discovery ────────────────────────────────────────────

/**
 * Parse the output of `docker compose port` to extract the host port.
 * Expected format: "127.0.0.1:55123" or "0.0.0.0:55123".
 */
export function parseProxyPortOutput(output: string): number {
  const match = output.trim().match(/:(\d+)$/);
  if (!match) {
    throw new Error(
      `Could not determine proxy port from 'docker compose port' output: "${output}"`,
    );
  }
  return parseInt(match[1], 10);
}

/**
 * Discover the randomly assigned host port for a proxy service.
 * Runs `docker compose port <service> 9090` and parses the output.
 */
export async function discoverProxyPort(
  composeFile: string,
  proxyServiceName: string,
): Promise<number> {
  const { execFileSync } = await import("child_process");
  const output = execFileSync(
    "docker",
    ["compose", "-f", composeFile, "port", proxyServiceName, "9090"],
    { encoding: "utf-8", timeout: 10_000 },
  ).trim();

  return parseProxyPortOutput(output);
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
      stdio: ["ignore", "pipe", "pipe"],
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
export async function ensureDockerBuild(
  roleType: Role,
  agentType: string,
  projectDir: string,
  deps?: { existsSyncFn?: (p: string) => boolean; forceRebuild?: boolean; devContainerCustomizations?: DevContainerCustomizations; agentConfigCredentials?: string[]; agentArgs?: string[]; initialPrompt?: string; llmConfig?: { provider: string; model: string }; printMode?: boolean; jsonMode?: boolean },
): Promise<{ dockerBuildDir: string; dockerDir: string; rebuilt: boolean }> {
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
      jsonMode: deps?.jsonMode,
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
    return { dockerBuildDir, dockerDir, rebuilt: true };
  }

  return { dockerBuildDir, dockerDir, rebuilt: false };
}

// ── Help Text ─────────────────────────────────────────────────────────

export const RUN_AGENT_HELP_EPILOG = `
Command Syntax:
  mason run --role <name>                    # infers agent from role dialect
  mason run --role <name> --agent claude     # explicit agent (renamed from --agent-type)
  mason claude --role <name>                 # shorthand (config-declared or built-in agent)

  --agent <name>   Agent name from .mason/config.json or built-in alias.
                   Config entry can supply defaults for --role, --home, and mode.
  --home <path>    Bind-mount <path> over /home/mason/ in the agent container.
                   Overrides the "home" property in .mason/config.json.
  --terminal       Force terminal (interactive) mode, overriding config mode.
  --bash           Launch bash shell (overrides config mode).

Agent Types (built-in):
  claude (claude-code-agent), pi (pi-coding-agent), mcp (mcp-agent)

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
    opts?: { interactive?: boolean; verbose?: boolean; logger?: FileLogger },
  ) => Promise<number>;
  /** Override session ID generation (for testing). */
  generateSessionIdFn?: () => string;
  /** Override session store createSession (for testing). */
  createSessionFn?: (cwd: string, agent: string, role: string) => Promise<{ sessionId: string }>;
  /** Override docker compose check (for testing). */
  checkDockerComposeFn?: () => void;
  /** Override .gitignore entry management (for testing). */
  ensureGitignoreEntryFn?: (dir: string, pattern: string) => boolean;
  /** Override role resolution (for testing). */
  resolveRoleFn?: (roleName: string, projectDir: string) => Promise<Role>;
  /** Override agent adaptation (for testing). */
  adaptRoleFn?: (roleType: Role, agentType: string) => ResolvedAgent;
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
  /** Override proxy port discovery (for testing). */
  discoverProxyPortFn?: (composeFile: string, proxyServiceName: string) => Promise<number>;
  /** Override proxy health check (for testing). */
  waitForProxyHealthFn?: (url: string, timeoutMs: number) => Promise<void>;
  /** Override logger creation (for testing). */
  createLoggerFn?: (logDir: string) => FileLogger;
  /** Override home path (for testing). */
  homeOverride?: string;
  /** Override registry initialization (for testing). */
  initRegistryFn?: (projectDir: string, cliVersion?: string) => Promise<void>;
}

// ── Resume Flow ───────────────────────────────────────────────────────

/**
 * Format an ISO 8601 date string as a human-readable relative time.
 */
export function formatRelativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  if (diffDay === 1) return "yesterday";
  return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
}

/**
 * Extract the Docker image name for the agent service from a session's
 * docker-compose.yaml. Returns null if the compose file doesn't exist
 * or the image field can't be parsed.
 */
export function getResumeDockerImage(sessionDir: string): string | null {
  const composeFile = path.join(sessionDir, "docker-compose.yaml");
  try {
    const content = fs.readFileSync(composeFile, "utf-8");
    // Find the agent service's image line. Agent services are named "agent-*"
    // and the image field follows on the next line after the service key.
    const lines = content.split("\n");
    let inAgentService = false;
    for (const line of lines) {
      if (/^\s{2}agent-[^:]+:/.test(line)) {
        inAgentService = true;
        // Check for image on the same line (format: "  agent-foo:\n    image: name")
        continue;
      }
      if (inAgentService) {
        const imageMatch = line.match(/^\s+image:\s*(.+)/);
        if (imageMatch) return imageMatch[1].trim();
        // If we hit another top-level service key or a non-indented line, stop
        if (/^\s{2}\S/.test(line) && !/^\s{4,}/.test(line)) {
          inAgentService = false;
        }
      }
    }
  } catch {
    // Compose file not readable
  }
  return null;
}

/**
 * Print an error message when a session is not found, including a list
 * of available sessions for guidance.
 */
async function printSessionNotFoundError(
  sessionId: string,
  cwd: string,
): Promise<void> {
  const sessions = await listSessions(cwd);
  console.error(`\n  Error: Cannot resume session "${sessionId}" — session not found.\n`);
  if (sessions.length > 0) {
    console.error("  Available sessions:");
    for (const s of sessions) {
      const shortId = s.sessionId.slice(0, 8);
      const prompt = s.firstPrompt ? `"${s.firstPrompt.slice(0, 40)}"` : "(no prompt)";
      const ago = formatRelativeTime(s.lastUpdated);
      console.error(`    ${shortId}  ${s.agent} / ${s.role}  ${prompt}  (${ago})`);
    }
    console.error("");
  }
  console.error(`  Run "mason run --resume <session-id>" with a valid session.\n`);
}

/**
 * Handle `mason run --resume [session-id]`.
 *
 * Resolves the session, validates it, generates agent-launch.json with
 * resume args, and launches Docker compose from the existing session directory.
 */
async function handleResume(
  projectDir: string,
  opts: {
    resume: string | boolean;
    agent?: string;
    role?: string;
    initialPrompt?: string;
    isPrintMode?: boolean;
    isJsonMode?: boolean;
    verbose?: boolean;
    build?: boolean;
  },
): Promise<void> {
  // 1. Resolve session ID
  let sessionId: string;
  if (opts.resume === true || opts.resume === "latest") {
    const latest = await resolveLatestSession(projectDir);
    if (!latest) {
      console.error(`\n  Error: No latest session found. Run "mason run" first to create a session.\n`);
      process.exit(1);
      return;
    }
    sessionId = latest;
  } else {
    sessionId = opts.resume as string;
  }

  // 2. Load session metadata
  const session = await readSession(projectDir, sessionId);
  if (!session) {
    await printSessionNotFoundError(sessionId, projectDir);
    process.exit(1);
    return;
  }

  // 3. Validate session is not closed
  if (session.closed) {
    console.error(`\n  Error: Cannot resume session "${sessionId}" — session is closed.\n`);
    process.exit(1);
    return;
  }

  // 4. Validate Docker image exists
  const sessionDir = path.join(projectDir, ".mason", "sessions", sessionId);
  const imageName = getResumeDockerImage(sessionDir);
  if (imageName) {
    try {
      execSync(`docker image inspect "${imageName}"`, { stdio: "ignore" });
    } catch {
      console.error(`\n  Error: Docker image "${imageName}" not found. The session's container image may have been removed.\n`);
      process.exit(1);
      return;
    }
  }

  // 5. Warn if --agent or --role were provided
  if (opts.agent) {
    console.warn("  Warning: --agent is ignored when resuming a session (agent is fixed at session creation).");
  }
  if (opts.role) {
    console.warn("  Warning: --role is ignored when resuming a session (role is fixed at session creation).");
  }

  // 6. Extract agent + role from session metadata
  const { agent: agentType, role: roleName } = session;

  // Initialize agent registry so we can look up agent package
  await initRegistry(projectDir, getCliVersion());

  // 7. Resolve resume args from agent's resume config
  const agentPkg = getAgentFromRegistry(agentType);
  let resumeId: string | undefined;
  if (session.agentSessionId && agentPkg?.resume) {
    // Read the session ID field specified by the agent's resume config
    const field = agentPkg.resume.sessionIdField;
    resumeId = (session as unknown as Record<string, unknown>)[field] as string | undefined;
  }

  console.log(`\n  Resuming session: ${sessionId}`);
  console.log(`  Agent: ${agentType}`);
  console.log(`  Role: ${roleName}`);
  if (resumeId) {
    console.log(`  Agent session: ${resumeId}`);
  }

  // 8. Resolve role and regenerate agent-launch.json with resume args
  const resolveRoleFn = defaultResolveRole;
  let roleType: Role;
  try {
    roleType = await resolveRoleFn(roleName, projectDir);
  } catch {
    // If role resolution fails (e.g., role was removed), create a minimal role
    // This is acceptable since resume reuses existing Docker artifacts
    roleType = {
      metadata: { name: roleName },
      type: "project",
      sources: [],
    } as unknown as Role;
  }

  refreshAgentLaunchJson(roleType, agentType, sessionDir, {
    initialPrompt: opts.initialPrompt,
    printMode: opts.isPrintMode,
    jsonMode: opts.isJsonMode,
    resumeId,
  });

  // 9. Update lastUpdated in meta.json
  await updateSession(projectDir, sessionId, {
    lastUpdated: new Date().toISOString(),
  });

  // 10. Launch Docker compose from existing session directory
  const composeFile = path.join(sessionDir, "docker-compose.yaml");
  if (!fs.existsSync(composeFile)) {
    console.error(`\n  Error: Compose file not found at ${composeFile}.\n`);
    process.exit(1);
    return;
  }

  // Pre-flight: check Docker Compose is available
  try {
    checkDockerCompose();
  } catch (err) {
    console.error(`\n  ${(err as Error).message}\n`);
    process.exit(1);
    return;
  }

  const proxyServiceName = `proxy-${roleName}`;
  const agentServiceName = `agent-${roleName}`;

  console.log(`  Compose: .mason/sessions/${sessionId}/docker-compose.yaml`);

  // Start proxy
  console.log(`  Starting proxy (${proxyServiceName})...`);
  const proxyCode = await execComposeCommand(
    composeFile,
    ["up", "-d", proxyServiceName],
    { verbose: opts.verbose },
  );
  if (proxyCode !== 0) {
    console.error(`\n  Error: Failed to start proxy (exit code ${proxyCode}).\n`);
    process.exit(1);
    return;
  }
  console.log(`  Proxy started in background.`);

  // Discover random port, then wait for proxy health
  const proxyPort = await discoverProxyPort(composeFile, proxyServiceName);
  console.log(`  Waiting for proxy to be ready (port ${proxyPort})...`);
  await defaultWaitForProxyHealth(`http://localhost:${proxyPort}/health`, 60_000);
  console.log(`  Proxy ready.`);

  // Start host proxy in-process
  const adaptRoleFn = defaultAdaptRole;
  const resolvedAgent = adaptRoleFn(roleType, agentType);
  mergeAgentConfigCredentials(resolvedAgent, undefined);
  const envCredentials = collectEnvCredentials(resolvedAgent);
  const hostApps = resolvedAgent.roles.flatMap((r) => r.apps).filter((a) => a.location === "host");

  // Read relay token from compose file
  const composeContent = fs.readFileSync(composeFile, "utf-8");
  const relayTokenMatch = composeContent.match(/RELAY_TOKEN=([a-f0-9]+)/);
  if (!relayTokenMatch) {
    console.error(`\n  Error: Could not extract RELAY_TOKEN from compose file. Session may be corrupted.\n`);
    process.exit(1);
    return;
  }
  const relayToken = relayTokenMatch[1];

  console.log(`  Starting host proxy (in-process)...`);
  let hostProxyHandle: { stop: () => Promise<void> } | null = null;
  try {
    hostProxyHandle = await defaultStartHostProxy({
      proxyPort,
      relayToken,
      envCredentials,
      hostApps: hostApps.length > 0 ? hostApps : undefined,
    });
    console.log(`  Host proxy connected to Docker proxy.`);
  } catch (err) {
    console.error(`\n  Error: Failed to start host proxy: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
    return;
  }

  // Start agent interactively
  console.log(`  Starting agent (${agentServiceName})...\n`);
  const runArgs = ["run", "--rm", "--service-ports"];
  if (!process.stdin.isTTY) {
    runArgs.push("-T");
  }
  runArgs.push(agentServiceName);

  const agentCode = await runAgentWithOciRestart(composeFile, runArgs);

  // Tear down
  console.log(`\n  Agent exited (code ${agentCode}). Tearing down services...`);
  try {
    if (hostProxyHandle) {
      await hostProxyHandle.stop();
    }
  } catch { /* best-effort */ }

  await execComposeCommand(composeFile, ["down"], { verbose: opts.verbose });

  console.log(`  Services stopped.`);
  console.log(`  Session retained at: .mason/sessions/${sessionId}/`);
  console.log(`\n  agent complete\n`);
}

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
    source: { type: "local", agentDialect: primaryDialect, path: path.join(projectDir, ".mason", "roles", "project") },
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
      json?: string;
      resume?: string | boolean;
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
    const initialPrompt = options.print ?? options.json ?? promptPositional ?? overridePrompt;
    const isPrintMode = !!options.print;
    const isJsonMode = !!options.json;
    const projectDir = process.cwd();

    // ── Resume flow (short-circuits normal agent/role resolution) ─────
    if (options.resume) {
      await handleResume(projectDir, {
        resume: options.resume,
        agent: options.agent,
        role: options.role,
        initialPrompt,
        isPrintMode,
        isJsonMode,
        verbose: options.verbose,
        build: options.build,
      });
      return;
    }

    // Auto-init .mason/config.json when an agent name is provided
    if (agentInput) {
      ensureMasonConfig(projectDir);
    }

    // Initialize agent registry early so agent type resolution can discover installed agents
    await initRegistry(projectDir, getCliVersion());

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

    if (isPrintMode && isJsonMode) {
      console.error(`\n  -p/--print and --json are mutually exclusive.\n`);
      process.exit(1);
      return;
    }

    if (isPrintMode) {
      const conflicts = [
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

    if (isJsonMode) {
      const conflicts = [
        options.bash && "--bash",
        options.devContainer && "--dev-container",
        options.proxyOnly && "--proxy-only",
      ].filter(Boolean);
      if (conflicts.length > 0) {
        console.error(`\n  --json is mutually exclusive with ${conflicts.join(", ")}.\n`);
        process.exit(1);
        return;
      }
    }

    // Derive effective mode: explicit flags > config mode > terminal (default)
    const effectiveBash =
      options.bash ||
      (!options.terminal && configEntry?.mode === "bash");

    // Resolve agent type from effective agent name (after alias resolution).
    // Uses async resolution with auto-install fallback for agents not in registry.
    let resolvedAgentType: string | undefined;
    if (effectiveAgentInput) {
      resolvedAgentType = await resolveAgentTypeWithAutoInstall(effectiveAgentInput);
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
      await runProxyOnly(projectDir, resolvedAgentType, effectiveRoleName, undefined, preResolvedRole);
    } else if (options.devContainer) {
      await runAgent(projectDir, resolvedAgentType, effectiveRoleName, undefined, {
        devContainer: true,

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
    } else if (isJsonMode) {
      await runAgent(projectDir, resolvedAgentType, effectiveRoleName, undefined, {
        jsonMode: true,

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
    .option("--bash", "Launch bash shell instead of the agent (for debugging)")
    .option("--terminal", "Force terminal (interactive) mode, overriding config mode")
    .option("--build", "Force rebuild Docker images before running")
    .option("--role <name>", "Role name to run")
    .option("--agent <name>", "Agent name from .mason/config.json or built-in alias")
    .option("--home <path>", "Bind-mount path over /home/mason/ in the agent container")
    .option("--dev-container", "Start in dev-container mode: print IDE attach instructions and optionally launch VSCode")
    .option("--proxy-only", "Start proxy infrastructure only, output connection info as JSON")
    .option("--verbose", "Show Docker build and compose output")
    .option("-p, --print <prompt>", "Run in print mode: execute prompt non-interactively, output response only")
    .option("--json <prompt>", "Run in JSON streaming mode: emit newline-delimited ACP session update objects")
    .option("--resume [session-id]", "Resume a previous session (default: latest)")
    .addOption(
      new Option("--source <name>", "Agent source directory to scan (repeatable). Overrides role sources.")
        .argParser((value: string, previous: string[] | undefined) => [...(previous ?? []), value]),
    )
    .addHelpText("after", RUN_AGENT_HELP_EPILOG)
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
    .option("--bash", "Launch bash shell instead of the agent (for debugging)")
    .option("--terminal", "Force terminal (interactive) mode, overriding config mode")
    .option("--build", "Force rebuild Docker images before running")
    .option("--agent <name>", "Agent name from .mason/config.json or built-in alias")
    .option("--home <path>", "Bind-mount path over /home/mason/ in the agent container")
    .option("--dev-container", "Start in dev-container mode: print IDE attach instructions and optionally launch VSCode")
    .option("--proxy-only", "Start proxy infrastructure only, output connection info as JSON")
    .option("--verbose", "Show Docker build and compose output")
    .action(createRunAction(CONFIGURE_ROLE, CONFIGURE_PROMPT));
}

// ── Main Orchestrator ─────────────────────────────────────────────────

export async function runAgent(
  projectDir: string,
  agent: string | undefined,
  role: string,
  deps?: RunAgentDeps,
  acpOptions?: {
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
    jsonMode?: boolean;
  },
): Promise<void> {
  // Initialize agent registry with config-declared agents from .mason/config.json
  const initRegistryFn = deps?.initRegistryFn ?? initRegistry;
  await initRegistryFn(projectDir, getCliVersion());

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

  const isDevContainerMode = acpOptions?.devContainer === true;
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
  const isJsonMode = acpOptions?.jsonMode === true;

  if (isJsonMode) {
    const verbose = acpOptions?.verbose === true;
    return runAgentJsonMode(projectDir, agent, role, deps, buildMode, verbose, homeOverride, agentConfigCredentials, agentArgs, initialPrompt, sourceOverride, preResolvedRole, llmConfig);
  } else if (isPrintMode) {
    const verbose = acpOptions?.verbose === true;
    return runAgentPrintMode(projectDir, agent, role, deps, buildMode, verbose, homeOverride, agentConfigCredentials, agentArgs, initialPrompt, sourceOverride, preResolvedRole, llmConfig);
  } else if (isDevContainerMode) {
    const verbose = acpOptions?.verbose === true;
    return runAgentDevContainerMode(
      projectDir, agent, role, deps, buildMode, verbose, homeOverride,
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
    return runAgentInteractiveMode(projectDir, agent, role, deps, bashMode, buildMode, verbose, homeOverride, agentConfigCredentials, agentArgs, initialPrompt, sourceOverride, preResolvedRole, llmConfig);
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
 * Regenerate agent-launch.json in the per-session directory.
 *
 * Writes to `.mason/sessions/{id}/agent-launch.json` so each session can have
 * its own launch configuration (e.g., resume args). The session directory is
 * mounted into the container at `/home/mason/.mason/session/`, where
 * `agent-entry` loads it as the primary config path.
 *
 * Falls back silently if materialization fails -- the initial build already
 * created a copy in the workspace directory as a fallback.
 */
function refreshAgentLaunchJson(
  roleType: Role,
  agentType: string,
  sessionDir: string,
  options?: {
    agentConfigCredentials?: string[];
    agentArgs?: string[];
    initialPrompt?: string;
    llmConfig?: { provider: string; model: string };
    printMode?: boolean;
    jsonMode?: boolean;
    resumeId?: string;
  },
): void {
  try {
    const workspace = materializeForAgent(roleType, agentType, undefined, undefined, options);
    let launchJson = workspace.get("agent-launch.json");
    if (launchJson) {
      // Post-process to inject resume args when resuming a session.
      // This works regardless of which materializer generated the launch JSON.
      if (options?.resumeId) {
        const agentPkg = getAgentFromRegistry(agentType);
        if (agentPkg?.resume) {
          const parsed = JSON.parse(launchJson) as { args?: string[]; [key: string]: unknown };
          if (agentPkg.resume.position === "after-first" && parsed.args && parsed.args.length > 0) {
            parsed.args = [parsed.args[0], agentPkg.resume.flag, options.resumeId, ...parsed.args.slice(1)];
          } else {
            parsed.args = [...(parsed.args ?? []), agentPkg.resume.flag, options.resumeId];
          }
          launchJson = JSON.stringify(parsed, null, 2);
        }
      }
      fs.mkdirSync(sessionDir, { recursive: true });
      fs.writeFileSync(path.join(sessionDir, "agent-launch.json"), launchJson);
    }
  } catch (err) {
    if (options?.resumeId) {
      // During resume, failing to generate agent-launch.json with resume args
      // means the agent would start fresh instead of resuming — surface the error.
      throw new Error(`Failed to generate agent-launch.json for resume: ${err instanceof Error ? err.message : String(err)}`);
    }
    // Best-effort for non-resume: the initial build already created agent-launch.json in
    // the workspace directory. If re-materialization fails (e.g., incomplete
    // role schema), agent-entry will fall back to the workspace copy.
  }
}

// ── Interactive Mode ──────────────────────────────────────────────────

async function runAgentInteractiveMode(
  projectDir: string,
  agentOverride: string | undefined,
  role: string,
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
  const discoverPort = deps?.discoverProxyPortFn ?? discoverProxyPort;

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
    const { dockerBuildDir, dockerDir, rebuilt } = await ensureDockerBuild(
      roleType, agentType, projectDir, { existsSyncFn: deps?.existsSyncFn, forceRebuild: buildMode, agentConfigCredentials, agentArgs, initialPrompt, llmConfig },
    );

    // 5. Ensure .mason is in project's .gitignore
    ensureGitignore(projectDir, ".mason");

    // 5b. Pre-flight cleanup of stale Docker resources
    await quickAutoCleanup(projectDir);

    // 6. Create session directory with compose file
    const { uid, gid } = getHostIds();
    const declaredCredentialKeys = collectDeclaredCredentialKeys(agentType, agentConfigCredentials, roleType);
    const createSessionStore = deps?.createSessionFn ?? createMetaSession;
    const metaSession = await createSessionStore(projectDir, agentType, roleName);
    const session = createSessionDirectory({
      projectDir,
      dockerBuildDir,
      dockerDir,
      role: roleType,
      agentType,
      agentName: roleName,
      roleMounts: roleType.container?.mounts,
      credentialKeys: declaredCredentialKeys,
      hostUid: uid,
      hostGid: gid,
      homeOverride,
      bashMode,
      verbose,
      sessionId: metaSession.sessionId,
      agentShortName: getAgentFromRegistry(agentType)?.aliases?.[0] ?? agentType,
    });

    // 6b. Write per-session agent-launch.json (after session dir exists)
    refreshAgentLaunchJson(roleType, agentType, session.sessionDir, {
      agentConfigCredentials, agentArgs, initialPrompt, llmConfig,
    });

    const { sessionId, composeFile, relayToken, proxyServiceName, agentServiceName } = session;
    console.log(`  Session: ${sessionId}`);
    console.log(`  Compose: .mason/sessions/${sessionId}/docker-compose.yaml`);

    // 7. Build and start proxy detached
    if (rebuilt || buildMode) {
      console.log(`\n  Building proxy (${proxyServiceName})...`);

      const buildArgs = ["build"];
      if (buildMode) buildArgs.push("--no-cache");
      buildArgs.push(proxyServiceName, agentServiceName);

      const buildCode = await execCompose(
        composeFile,
        buildArgs,
        { verbose },
      );
      if (buildCode !== 0) {
        throw new Error(`Failed to build images (exit code ${buildCode}).`);
      }
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

    // 8b. Discover random port, then wait for proxy health
    const proxyPort = await discoverPort(composeFile, proxyServiceName);
    console.log(`  Waiting for proxy to be ready (port ${proxyPort})...`);
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
    const runArgs = ["run", "--rm", "--service-ports"];
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

// ── JSON Streaming Mode ───────────────────────────────────────────────

async function runAgentJsonMode(
  projectDir: string,
  agentOverride: string | undefined,
  role: string,
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
  const discoverPort = deps?.discoverProxyPortFn ?? discoverProxyPort;

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

    console.log(`[json] Agent: ${agentType}`);
    console.log(`[json] Role: ${roleName} (${roleType.type})`);

    // 2. Ensure docker build artifacts (with jsonMode so json stream args land in agent-launch.json)
    const { dockerBuildDir, dockerDir, rebuilt } = await ensureDockerBuild(
      roleType, agentType, projectDir, { existsSyncFn: deps?.existsSyncFn, forceRebuild: buildMode, agentConfigCredentials, agentArgs, initialPrompt, llmConfig, jsonMode: true },
    );

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
    const createSessionStore = deps?.createSessionFn ?? createMetaSession;
    const metaSession = await createSessionStore(projectDir, agentType, roleName);
    const session = createSessionDirectory({
      projectDir,
      dockerBuildDir,
      dockerDir,
      role: roleType,
      agentType,
      agentName: roleName,
      roleMounts: roleType.container?.mounts,
      credentialKeys: declaredCredentialKeys,
      hostUid: uid,
      hostGid: gid,
      homeOverride,
      verbose,
      sessionId: metaSession.sessionId,
      agentShortName: getAgentFromRegistry(agentType)?.aliases?.[0] ?? agentType,
    });

    // 5b. Write per-session agent-launch.json (after session dir exists)
    refreshAgentLaunchJson(roleType, agentType, session.sessionDir, {
      agentConfigCredentials, agentArgs, initialPrompt, llmConfig, jsonMode: true,
    });

    const { sessionId, composeFile, relayToken, proxyServiceName, agentServiceName } = session;
    console.log(`[json] Session: ${sessionId}`);

    // 6. Build and start proxy
    if (rebuilt || buildMode) {
      const buildArgs = ["build"];
      if (buildMode) buildArgs.push("--no-cache");
      buildArgs.push(proxyServiceName, agentServiceName);
      const buildCode = await execCompose(composeFile, buildArgs, { verbose, logger: fileLogger });
      if (buildCode !== 0) throw new Error(`Failed to build images (exit code ${buildCode}).`);
    }

    const proxyCode = await execCompose(composeFile, ["up", "-d", proxyServiceName], { verbose, logger: fileLogger, timeoutMs: 30_000 });
    if (proxyCode !== 0) throw new Error(`Failed to start proxy (exit code ${proxyCode}).`);

    const proxyPort = await discoverPort(composeFile, proxyServiceName);
    await waitForProxyHealth(`http://localhost:${proxyPort}/health`, 60_000);
    console.log(`[json] Proxy ready (port ${proxyPort}).`);

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

    // 8. Run agent with stream capture — emit ACP session updates as NDJSON
    console.log(`[json] Starting agent (${agentServiceName})...`);

    const agentPkg = getAgentFromRegistry(agentType);
    const parseJsonStreamAsACP = agentPkg?.jsonMode?.parseJsonStreamAsACP;

    let previousLine: string | undefined;
    const runArgs = ["run", "--rm", "--service-ports", "-T", agentServiceName];
    fileLogger.log(`[json] Docker command: docker compose -f ${composeFile} ${runArgs.join(" ")}`);
    const { code: agentCode, stderr: composeStderr } = await execComposeRunWithStreamCapture(composeFile, runArgs, (line) => {
      fileLogger.log(`[stream] ${line}`);
      if (parseJsonStreamAsACP) {
        const trimmed = line.trimStart();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          try {
            const result = parseJsonStreamAsACP(line, previousLine);
            if (result !== null) {
              const updates = Array.isArray(result) ? result : [result];
              for (const update of updates) {
                const validation = validateAcpUpdate(update);
                if (!validation.valid) {
                  fileLogger.error(`[stream] ACP validation error: ${validation.errors?.join("; ")}`);
                }
                process.stdout.write(JSON.stringify(update) + "\n");
              }
            }
          } catch (err) {
            fileLogger.error(`[stream] parse error: ${err instanceof Error ? err.message : String(err)}`);
          }
          previousLine = line;
        }
      }
    });

    // Log agent container stderr (includes agent-entry output)
    if (composeStderr) {
      for (const line of composeStderr.split("\n")) {
        if (line.trim()) fileLogger.log(`[stderr] ${line}`);
      }
    }

    // 9. Tear down
    console.log(`[json] Agent exited (code ${agentCode}). Tearing down...`);
    try { if (hostProxyHandle) await hostProxyHandle.stop(); } catch { /* best-effort */ }
    await execCompose(composeFile, ["down"], { verbose: false });

    // 10. Restore console
    console.log = origLog;
    console.error = origError;
    fileLogger.close();
    logger = null;

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

// ── Print Mode ────────────────────────────────────────────────────────

async function runAgentPrintMode(
  projectDir: string,
  agentOverride: string | undefined,
  role: string,
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
  const discoverPort = deps?.discoverProxyPortFn ?? discoverProxyPort;

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
    const { dockerBuildDir, dockerDir, rebuilt } = await ensureDockerBuild(
      roleType, agentType, projectDir, { existsSyncFn: deps?.existsSyncFn, forceRebuild: buildMode, agentConfigCredentials, agentArgs, initialPrompt, llmConfig, printMode: true },
    );

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
    const createSessionStore = deps?.createSessionFn ?? createMetaSession;
    const metaSession = await createSessionStore(projectDir, agentType, roleName);
    const session = createSessionDirectory({
      projectDir,
      dockerBuildDir,
      dockerDir,
      role: roleType,
      agentType,
      agentName: roleName,
      roleMounts: roleType.container?.mounts,
      credentialKeys: declaredCredentialKeys,
      hostUid: uid,
      hostGid: gid,
      homeOverride,
      verbose,
      sessionId: metaSession.sessionId,
      agentShortName: getAgentFromRegistry(agentType)?.aliases?.[0] ?? agentType,
    });

    // 5b. Write per-session agent-launch.json (after session dir exists)
    refreshAgentLaunchJson(roleType, agentType, session.sessionDir, {
      agentConfigCredentials, agentArgs, initialPrompt, llmConfig, printMode: true,
    });

    const { sessionId, composeFile, relayToken, proxyServiceName, agentServiceName } = session;
    console.log(`[print] Session: ${sessionId}`);

    // 6. Build and start proxy
    if (rebuilt || buildMode) {
      const buildArgs = ["build"];
      if (buildMode) buildArgs.push("--no-cache");
      buildArgs.push(proxyServiceName, agentServiceName);
      const buildCode = await execCompose(composeFile, buildArgs, { verbose, logger: fileLogger });
      if (buildCode !== 0) throw new Error(`Failed to build images (exit code ${buildCode}).`);
    }

    const proxyCode = await execCompose(composeFile, ["up", "-d", proxyServiceName], { verbose, logger: fileLogger, timeoutMs: 30_000 });
    if (proxyCode !== 0) throw new Error(`Failed to start proxy (exit code ${proxyCode}).`);

    const proxyPort = await discoverPort(composeFile, proxyServiceName);
    await waitForProxyHealth(`http://localhost:${proxyPort}/health`, 60_000);
    console.log(`[print] Proxy ready (port ${proxyPort}).`);

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
    let previousLine: string | undefined;
    const runArgs = ["run", "--rm", "--service-ports", "-T", agentServiceName];
    fileLogger.log(`[print] Docker command: docker compose -f ${composeFile} ${runArgs.join(" ")}`);
    const { code: agentCode, stderr: composeStderr } = await execComposeRunWithStreamCapture(composeFile, runArgs, (line) => {
      fileLogger.log(`[stream] ${line}`);
      if (parseFinalResult) {
        const trimmed = line.trimStart();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          try {
            const result = parseFinalResult(line, previousLine);
            if (result !== null) {
              finalResult = result;
            }
          } catch (err) {
            fileLogger.error(`[stream] parse error: ${err instanceof Error ? err.message : String(err)}`);
          }
          previousLine = line;
        }
      }
    });

    // Log agent container stderr (includes agent-entry output)
    if (composeStderr) {
      for (const line of composeStderr.split("\n")) {
        if (line.trim()) fileLogger.log(`[stderr] ${line}`);
      }
    }

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
  const discoverPort = deps?.discoverProxyPortFn ?? discoverProxyPort;
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
    const { dockerBuildDir, dockerDir, rebuilt } = await ensureDockerBuild(
      roleType, agentType, projectDir,
      { existsSyncFn: deps?.existsSyncFn, forceRebuild: buildMode, devContainerCustomizations, agentConfigCredentials, agentArgs, initialPrompt, llmConfig },
    );

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
    const createSessionStore = deps?.createSessionFn ?? createMetaSession;
    const metaSession = await createSessionStore(projectDir, agentType, roleName);
    const session = createSessionDirectory({
      projectDir,
      dockerBuildDir,
      dockerDir,
      role: roleType,
      agentType,
      agentName: roleName,
      roleMounts: roleType.container?.mounts,
      credentialKeys: declaredCredentialKeys,
      hostUid: uid,
      hostGid: gid,
      homeOverride,
      vscodeServerHostPath,
      verbose,
      sessionId: metaSession.sessionId,
      agentShortName: getAgentFromRegistry(agentType)?.aliases?.[0] ?? agentType,
    });

    // 6b. Write per-session agent-launch.json (after session dir exists)
    refreshAgentLaunchJson(roleType, agentType, session.sessionDir, {
      agentConfigCredentials, agentArgs, initialPrompt, llmConfig,
    });

    const { sessionId, composeFile, relayToken, proxyServiceName, agentServiceName } = session;

    // Derive compose project name for container name (VSCode attach)
    const projectHash = crypto.createHash("sha256").update(projectDir).digest("hex").slice(0, 8);
    const composeName = `mason-${projectHash}`;
    const containerName = deriveContainerName(composeName, agentServiceName);

    console.log(`  Session: ${sessionId}`);
    console.log(`  Compose: .mason/sessions/${sessionId}/docker-compose.yaml`);

    // 7. Build and start proxy
    if (rebuilt || buildMode) {
      console.log(`\n  Building proxy (${proxyServiceName})...`);
      const buildArgs = ["build"];
      if (buildMode) buildArgs.push("--no-cache");
      buildArgs.push(proxyServiceName);
      const buildCode = await execCompose(composeFile, buildArgs, { verbose });
      if (buildCode !== 0) throw new Error(`Failed to build proxy image (exit code ${buildCode}).`);
    }

    const proxyCode = await execCompose(composeFile, ["up", "-d", proxyServiceName], { verbose, timeoutMs: 30_000 });
    if (proxyCode !== 0) throw new Error(`Failed to start proxy (exit code ${proxyCode}).`);
    console.log(`  Proxy started.`);

    const proxyPort = await discoverPort(composeFile, proxyServiceName);
    await waitForProxyHealth(`http://localhost:${proxyPort}/health`, 60_000);
    console.log(`  Proxy ready (port ${proxyPort}).`);

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
    if (rebuilt || buildMode) {
      console.log(`\n  Building agent (${agentServiceName})...`);
      const agentBuildArgs = ["build"];
      if (buildMode) agentBuildArgs.push("--no-cache");
      agentBuildArgs.push(agentServiceName);
      const agentBuildCode = await execCompose(composeFile, agentBuildArgs, { verbose });
      if (agentBuildCode !== 0) throw new Error(`Failed to build agent image (exit code ${agentBuildCode}).`);
    }

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
  deps?: RunAgentDeps,
  preResolvedRole?: Role,
): Promise<void> {
  const execCompose = deps?.execComposeFn ?? execComposeCommand;
  const ensureGitignore = deps?.ensureGitignoreEntryFn ?? ensureGitignoreEntry;
  const resolveRoleFn = deps?.resolveRoleFn ?? defaultResolveRole;
  const discoverPort = deps?.discoverProxyPortFn ?? discoverProxyPort;

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
  const { dockerBuildDir, dockerDir, rebuilt } = await ensureDockerBuild(
    roleType, agentType, projectDir, { existsSyncFn: deps?.existsSyncFn },
  );

  // 5. Ensure .mason is in project's .gitignore
  ensureGitignore(projectDir, ".mason");

  // 6. Create session directory with compose file
  const { uid, gid } = getHostIds();
  const createSessionStore = deps?.createSessionFn ?? createMetaSession;
  const metaSession = await createSessionStore(projectDir, agentType, roleName);
  const session = createSessionDirectory({
    projectDir,
    dockerBuildDir,
    dockerDir,
    role: roleType,
    agentType,
    agentName: roleName,
    roleMounts: roleType.container?.mounts,
    hostUid: uid,
    hostGid: gid,
    sessionId: metaSession.sessionId,
    agentShortName: getAgentFromRegistry(agentType)?.aliases?.[0] ?? agentType,
  });

  const { sessionId, composeFile, proxyToken, proxyServiceName } = session;

  // 7. Build and start proxy detached
  if (rebuilt) {
    const buildCode = await execCompose(composeFile, ["build", proxyServiceName]);
    if (buildCode !== 0) {
      throw new Error(`Failed to build proxy image (exit code ${buildCode}).`);
    }
  }

  const upCode = await execCompose(composeFile, ["up", "-d", proxyServiceName]);
  if (upCode !== 0) {
    throw new Error(`Failed to start proxy (exit code ${upCode}).`);
  }

  // 9. Discover random port and output connection info as JSON to stdout
  const proxyPort = await discoverPort(composeFile, proxyServiceName);
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
