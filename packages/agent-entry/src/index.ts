/**
 * Agent Entry — Standalone entrypoint for agent Docker containers.
 *
 * Bootstrap flow:
 * 1. Read agent-launch.json for credential config and runtime command
 * 2. Read MCP_PROXY_TOKEN from environment
 * 3. POST to proxy /connect-agent → receive AGENT_SESSION_TOKEN + session_id
 * 4. Initialize MCP session with proxy
 * 5. For each credential, call credential_request MCP tool
 * 6. Install credentials (env vars or files)
 * 7. Spawn agent runtime with credentials in child env only
 * 8. Pipe stdio, propagate exit code
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { initializeMcpSession, callTool } from "./mcp-client.js";

// ── Constants ──────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// ── agent-launch.json Schema ──────────────────────────────────────────

export interface CredentialConfig {
  /** Credential key to request from credential service. */
  key: string;
  /** How to install the credential: "env" sets it as an env var, "file" writes it to a path. */
  type: "env" | "file";
  /** File path to write the credential value to (required when type is "file"). */
  path?: string;
}

export interface AgentLaunchConfig {
  /** Credentials to request and how to install them. */
  credentials: CredentialConfig[];
  /** Command to execute as the agent runtime. */
  command: string;
  /** Arguments to pass to the command. */
  args?: string[];
}

/**
 * Load agent-launch.json from the workspace or working directory.
 *
 * Search order:
 * 1. /home/mason/workspace/agent-launch.json (Docker container path)
 * 2. ./agent-launch.json (current working directory)
 *
 * Returns null if no config file is found (falls back to env vars).
 */
export function loadLaunchConfig(): AgentLaunchConfig | null {
  const searchPaths = [
    "/home/mason/workspace/agent-launch.json",
    path.join(process.cwd(), "agent-launch.json"),
  ];

  for (const configPath of searchPaths) {
    try {
      const content = fs.readFileSync(configPath, "utf-8");
      const config = JSON.parse(content) as AgentLaunchConfig;

      // Basic validation
      if (!config.command || typeof config.command !== "string") {
        throw new Error("agent-launch.json: 'command' is required and must be a string");
      }
      if (!Array.isArray(config.credentials)) {
        throw new Error("agent-launch.json: 'credentials' must be an array");
      }
      for (const cred of config.credentials) {
        if (!cred.key || typeof cred.key !== "string") {
          throw new Error("agent-launch.json: each credential must have a 'key' string");
        }
        if (cred.type !== "env" && cred.type !== "file") {
          throw new Error(`agent-launch.json: credential type must be 'env' or 'file', got '${cred.type}'`);
        }
        if (cred.type === "file" && (!cred.path || typeof cred.path !== "string")) {
          throw new Error(`agent-launch.json: credential '${cred.key}' with type 'file' must have a 'path'`);
        }
      }

      console.error(`[agent-entry] Loaded config from ${configPath}`);
      return config;
    } catch (err) {
      if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
        continue; // File not found, try next path
      }
      throw err; // Re-throw parse or validation errors
    }
  }

  return null;
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Connect to the proxy's /connect-agent endpoint and receive a session token.
 */
export async function connectToProxy(
  proxyUrl: string,
  token: string,
): Promise<{ sessionToken: string; sessionId: string }> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${proxyUrl}/connect-agent`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.status === 401) {
        throw new Error("authentication failed");
      }

      if (response.status === 403) {
        const body = (await response.json()) as { error: string };
        throw new Error(body.error);
      }

      if (!response.ok) {
        throw new Error(`connect-agent failed: ${response.status} ${response.statusText}`);
      }

      const body = (await response.json()) as {
        sessionToken: string;
        sessionId: string;
      };

      return { sessionToken: body.sessionToken, sessionId: body.sessionId };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry auth failures
      if (lastError.message === "authentication failed") {
        throw lastError;
      }

      // Don't retry session lock (403)
      if (lastError.message.includes("Session locked")) {
        throw lastError;
      }

      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  throw lastError ?? new Error("connect-agent failed after retries");
}

/**
 * Request credentials from the proxy via the credential_request MCP tool.
 */
export async function requestCredentials(
  proxyUrl: string,
  proxyToken: string,
  sessionToken: string,
  keys: string[],
): Promise<Record<string, string>> {
  if (keys.length === 0) return {};

  // Initialize MCP session
  const { sessionId: mcpSessionId } = await initializeMcpSession(proxyUrl, proxyToken);

  const credentials: Record<string, string> = {};
  const errors: string[] = [];

  for (const key of keys) {
    const result = await callTool(proxyUrl, proxyToken, mcpSessionId, "credential_request", {
      key,
      session_token: sessionToken,
    });

    // Parse the tool result
    const text = result.content[0]?.text;
    if (!text) {
      errors.push(`${key}: no response from credential service`);
      continue;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      // If the text is not JSON, treat the raw text as the value for simple responses
      if (result.isError) {
        errors.push(`${key}: ${text}`);
        continue;
      }
      errors.push(`${key}: unexpected response format`);
      continue;
    }

    if ("error" in parsed) {
      const code = parsed.code as string | undefined;
      const errorMsg = parsed.error as string;
      if (code === "ACCESS_DENIED") {
        errors.push(`${key}: access denied — ${errorMsg}`);
      } else if (code === "NOT_FOUND") {
        errors.push(`${key}: not found — ${errorMsg}`);
      } else {
        errors.push(`${key}: ${errorMsg}`);
      }
      continue;
    }

    if ("value" in parsed && typeof parsed.value === "string") {
      credentials[key] = parsed.value;
    } else {
      errors.push(`${key}: unexpected response format`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Credential retrieval failed:\n  ${errors.join("\n  ")}`);
  }

  return credentials;
}

/**
 * Install credentials based on their config type.
 *
 * - "env" credentials are returned as env vars for the child process
 * - "file" credentials are written to disk before launching the runtime
 *
 * @returns Record of env vars to pass to the child process
 */
export function installCredentials(
  credentialConfigs: CredentialConfig[],
  credentialValues: Record<string, string>,
): Record<string, string> {
  const envVars: Record<string, string> = {};

  for (const config of credentialConfigs) {
    const value = credentialValues[config.key];
    if (value === undefined) continue;

    if (config.type === "env") {
      envVars[config.key] = value;
    } else if (config.type === "file" && config.path) {
      // Ensure directory exists
      const dir = path.dirname(config.path);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(config.path, value, { mode: 0o600 });
      console.error(`[agent-entry] Wrote credential to ${config.path}`);
    }
  }

  return envVars;
}

/**
 * Launch the agent runtime as a child process with credentials in its env.
 *
 * The child process inherits stdio from the container process.
 * Credentials are set ONLY on the child process — they do not appear
 * in the container's own environment.
 *
 * @returns The child process exit code
 */
export async function launchRuntime(
  command: string,
  args: string[],
  credentialEnv: Record<string, string>,
): Promise<number> {
  // Build child env: start with parent env, remove sensitive tokens,
  // then add credentials
  const childEnv: Record<string, string> = {};

  // Copy parent env but filter out sensitive values
  const sensitiveKeys = new Set([
    "MCP_PROXY_TOKEN",
    "AGENT_SESSION_TOKEN",
    "AGENT_CREDENTIALS",
    "AGENT_RUNTIME_CMD",
  ]);

  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !sensitiveKeys.has(key)) {
      childEnv[key] = value;
    }
  }

  // Add credentials to child env only
  Object.assign(childEnv, credentialEnv);

  return new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, {
      env: childEnv,
      stdio: "inherit",
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to launch runtime: ${err.message}`));
    });

    child.on("close", (code) => {
      resolve(code ?? 1);
    });
  });
}

/**
 * Main bootstrap function — orchestrates the full agent-entry flow.
 */
export async function bootstrap(): Promise<never> {
  // 1. Read configuration from environment
  const proxyToken = process.env.MCP_PROXY_TOKEN;
  if (!proxyToken) {
    console.error("[agent-entry] MCP_PROXY_TOKEN not set");
    process.exit(1);
  }

  const proxyUrl = process.env.MCP_PROXY_URL ?? "http://proxy:3000";

  // 2. Load agent-launch.json or fall back to env vars
  const launchConfig = loadLaunchConfig();

  let credentialConfigs: CredentialConfig[];
  let command: string;
  let args: string[];

  if (launchConfig) {
    credentialConfigs = launchConfig.credentials;
    command = launchConfig.command;
    args = launchConfig.args ?? [];
  } else {
    // Legacy env var fallback
    console.error("[agent-entry] No agent-launch.json found, falling back to env vars");

    const credentialsJson = process.env.AGENT_CREDENTIALS ?? "[]";
    let credentialKeys: string[];
    try {
      credentialKeys = JSON.parse(credentialsJson) as string[];
      if (!Array.isArray(credentialKeys)) throw new Error("not an array");
    } catch {
      console.error("[agent-entry] AGENT_CREDENTIALS must be a JSON array of strings");
      process.exit(1);
    }

    // Convert legacy format: all credentials as env vars
    credentialConfigs = credentialKeys.map((key) => ({ key, type: "env" as const }));

    const runtimeCmd = process.env.AGENT_RUNTIME_CMD;
    if (!runtimeCmd) {
      console.error("[agent-entry] AGENT_RUNTIME_CMD not set");
      process.exit(1);
    }

    const cmdParts = runtimeCmd.split(/\s+/);
    command = cmdParts[0];
    args = cmdParts.slice(1);
  }

  const credentialKeys = credentialConfigs.map((c) => c.key);

  try {
    // 3. Connect to proxy
    console.error("[agent-entry] Connecting to proxy...");
    const { sessionToken } = await connectToProxy(proxyUrl, proxyToken);
    console.error("[agent-entry] Connected. Session established.");

    // 4. Request credentials
    let credentialEnv: Record<string, string> = {};
    if (credentialKeys.length > 0) {
      console.error(`[agent-entry] Requesting ${credentialKeys.length} credential(s)...`);
      const credentialValues = await requestCredentials(proxyUrl, proxyToken, sessionToken, credentialKeys);
      console.error("[agent-entry] All credentials received.");

      // 5. Install credentials (write files, build env vars)
      credentialEnv = installCredentials(credentialConfigs, credentialValues);
    } else {
      console.error("[agent-entry] No credentials requested.");
    }

    // 6. Launch runtime
    console.error(`[agent-entry] Launching runtime: ${command} ${args.join(" ")}`);
    const exitCode = await launchRuntime(command, args, credentialEnv);
    process.exit(exitCode);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[agent-entry] Fatal: ${message}`);
    process.exit(1);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Run if executed directly ───────────────────────────────────────────

// Detect if running as main module (works with esbuild bundle)
const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("agent-entry.js") || process.argv[1].endsWith("index.js"));

if (isMain) {
  bootstrap();
}
