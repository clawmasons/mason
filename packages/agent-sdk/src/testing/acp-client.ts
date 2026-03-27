/**
 * ACP client test helper — spawns `mason acp` and drives the full
 * ACP protocol lifecycle (initialize → newSession → prompt) using
 * the real @agentclientprotocol/sdk client over stdio.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { Readable, Writable } from "node:stream";
import {
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type SessionNotification,
  type PromptResponse,
} from "@agentclientprotocol/sdk";
import { MASON_BIN } from "./index.js";

export type { SessionNotification, PromptResponse };

export interface AcpResult {
  /** All session update notifications received during the prompt. */
  updates: SessionNotification[];
  /** The prompt response (contains stopReason). */
  promptResponse: PromptResponse;
  /** The child process that ran `mason acp`. */
  proc: ChildProcess;
}

/**
 * Spawn `mason acp`, drive the ACP protocol lifecycle, and return
 * the collected session updates.
 *
 * @param workspaceDir - Working directory (passed as cwd to the process and newSession)
 * @param agent - Agent name (e.g. "codex", "claude")
 * @param role - Role name (e.g. "writer", "project")
 * @param prompt - The text prompt to send
 * @param opts.timeout - Kill the process after this many ms (default: 300_000)
 * @param opts.env - Extra environment variables merged onto process.env
 */
export async function runMasonACP(
  workspaceDir: string,
  agent: string,
  role: string,
  prompt: string,
  opts?: { timeout?: number; env?: Record<string, string> },
): Promise<AcpResult> {
  const timeoutMs = opts?.timeout ?? 300_000;

  const proc = spawn("node", [MASON_BIN, "acp"], {
    cwd: workspaceDir,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      // Ensure the inner prompt-executor uses scripts/mason.js (with auto-linking)
      // instead of the published bin.js (without auto-linking).
      MASON_BIN,
      ...opts?.env,
    },
  });

  let stderr = "";
  if (proc.stderr) {
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
  }

  const cleanup = () => {
    if (!proc.killed) {
      proc.kill("SIGTERM");
    }
  };

  const run = async (): Promise<AcpResult> => {
    if (!proc.stdin || !proc.stdout) {
      throw new Error("Failed to open stdin/stdout on mason acp process");
    }

    // Convert child process streams to Web Streams for the ACP SDK
    const output = Writable.toWeb(proc.stdin) as WritableStream<Uint8Array>;
    const input = Readable.toWeb(proc.stdout) as ReadableStream<Uint8Array>;
    const stream = ndJsonStream(output, input);

    const sessionUpdates: SessionNotification[] = [];

    const clientConn = new ClientSideConnection(
      () => ({
        async requestPermission() {
          return { outcome: { outcome: "approved" as const } };
        },
        async sessionUpdate(params: SessionNotification) {
          sessionUpdates.push(params);
        },
      }),
      stream,
    );

    let step = "initialize";
    try {
      // 1. Initialize
      const initResponse = await clientConn.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {},
        clientInfo: { name: "mason-test", title: "Mason Test Client", version: "1.0.0" },
      });
      if (!initResponse.protocolVersion) {
        throw new Error(`ACP initialize failed: missing protocolVersion in response`);
      }

      // 2. Create session
      step = "newSession";
      const { sessionId, configOptions } = await clientConn.newSession({
        cwd: workspaceDir,
        mcpServers: [],
      });
      if (!sessionId) {
        throw new Error("ACP newSession did not return a sessionId");
      }

      // 3. Set role and agent if they differ from defaults
      if (configOptions) {
        const roleOpt = configOptions.find((o: { id: string }) => o.id === "role");
        const agentOpt = configOptions.find((o: { id: string }) => o.id === "agent");

        if (roleOpt && roleOpt.type === "select" && roleOpt.currentValue !== role) {
          step = "setSessionConfigOption(role)";
          await clientConn.setSessionConfigOption({
            sessionId,
            configId: "role",
            value: role,
          });
        }

        if (agentOpt && agentOpt.type === "select" && agentOpt.currentValue !== agent) {
          step = "setSessionConfigOption(agent)";
          await clientConn.setSessionConfigOption({
            sessionId,
            configId: "agent",
            value: agent,
          });
        }
      }

      // 4. Send prompt and wait for completion
      step = "prompt";
      const promptResponse = await clientConn.prompt({
        sessionId,
        prompt: [{ type: "text", text: prompt }],
      });

      return { updates: sessionUpdates, promptResponse, proc };
    } catch (err: unknown) {
      // Surface the actual error details — the ACP SDK's RequestError
      // puts the real message in .data, not .message
      const e = err as { message?: string; data?: unknown; code?: number };
      const dataStr = e.data ? ` data=${JSON.stringify(e.data)}` : "";
      throw new Error(
        `runMasonACP failed at step "${step}": ${e.message ?? String(err)}${dataStr}\nstderr:\n${stderr}`,
      );
    } finally {
      cleanup();
    }
  };

  // Race the protocol flow against a timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      cleanup();
      reject(new Error(
        `runMasonACP timed out after ${timeoutMs}ms.\nstderr:\n${stderr}`,
      ));
    }, timeoutMs);
  });

  return Promise.race([run(), timeoutPromise]);
}
