/**
 * Agent Entry — Standalone entrypoint for agent Docker containers.
 *
 * Bootstrap flow:
 * 1. Read MCP_PROXY_TOKEN from environment
 * 2. POST to proxy /connect-agent → receive AGENT_SESSION_TOKEN + session_id
 * 3. Initialize MCP session with proxy
 * 4. For each credential, call credential_request MCP tool
 * 5. Spawn agent runtime with credentials in child env only
 * 6. Pipe stdio, propagate exit code
 */

import { spawn } from "node:child_process";
import { initializeMcpSession, callTool } from "./mcp-client.js";

// ── Constants ──────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

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

  const credentialsJson = process.env.AGENT_CREDENTIALS ?? "[]";
  let credentialKeys: string[];
  try {
    credentialKeys = JSON.parse(credentialsJson) as string[];
    if (!Array.isArray(credentialKeys)) throw new Error("not an array");
  } catch {
    console.error("[agent-entry] AGENT_CREDENTIALS must be a JSON array of strings");
    process.exit(1);
  }

  const runtimeCmd = process.env.AGENT_RUNTIME_CMD;
  if (!runtimeCmd) {
    console.error("[agent-entry] AGENT_RUNTIME_CMD not set");
    process.exit(1);
  }

  // Parse runtime command into command + args
  const cmdParts = runtimeCmd.split(/\s+/);
  const command = cmdParts[0];
  const args = cmdParts.slice(1);

  try {
    // 2. Connect to proxy
    console.error("[agent-entry] Connecting to proxy...");
    const { sessionToken } = await connectToProxy(proxyUrl, proxyToken);
    console.error("[agent-entry] Connected. Session established.");

    // 3. Request credentials
    if (credentialKeys.length > 0) {
      console.error(`[agent-entry] Requesting ${credentialKeys.length} credential(s)...`);
      const credentials = await requestCredentials(proxyUrl, proxyToken, sessionToken, credentialKeys);
      console.error("[agent-entry] All credentials received.");

      // 4. Launch runtime with credentials
      console.error(`[agent-entry] Launching runtime: ${runtimeCmd}`);
      const exitCode = await launchRuntime(command, args, credentials);
      process.exit(exitCode);
    } else {
      // No credentials needed, just launch
      console.error(`[agent-entry] No credentials requested. Launching runtime: ${runtimeCmd}`);
      const exitCode = await launchRuntime(command, args, {});
      process.exit(exitCode);
    }
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
