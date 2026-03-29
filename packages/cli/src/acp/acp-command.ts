import type { Command } from "commander";
import { resolve } from "node:path";
import { Readable, Writable } from "node:stream";
import { AgentSideConnection, ndJsonStream } from "@agentclientprotocol/sdk";
import { createMasonAcpAgent, setPinnedArgs } from "./acp-agent.js";
import { closeAcpLogger, acpStartupLog } from "./acp-logger.js";

/**
 * Register the `mason acp` command.
 *
 * Starts an ACP agent using stdio transport (stdin/stdout with
 * newline-delimited JSON-RPC 2.0). The command redirects console
 * output to stderr so stdout is exclusively used for ACP protocol
 * messages.
 */
export function registerAcpCommand(program: Command): void {
  program
    .command("acp")
    .description("Start an ACP (Agent Client Protocol) agent over stdio")
    .option("--agent <name>", "Pin agent for all sessions on this connection")
    .option("--role <name>", "Pin role for all sessions on this connection")
    .option("--source <path>", "Pin source directory for all sessions on this connection")
    .action(async (opts: { agent?: string; role?: string; source?: string }) => {
      acpStartupLog("acp command action entered", { pid: process.pid, argv: process.argv });

      // Store pinned args before creating the connection
      setPinnedArgs({
        agent: opts.agent,
        role: opts.role,
        source: opts.source ? resolve(process.cwd(), opts.source) : undefined,
      });

      // Redirect console output to stderr so stdout is reserved for ACP messages
      const stderrConsole = new console.Console(process.stderr, process.stderr);
      globalThis.console = stderrConsole;
      acpStartupLog("console redirected to stderr");

      // Convert Node.js streams to Web Streams for the SDK
      const output = Writable.toWeb(process.stdout) as WritableStream<Uint8Array>;
      const input = Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>;
      acpStartupLog("stdio streams converted to Web Streams");

      const stream = ndJsonStream(output, input);
      acpStartupLog("NDJSON stream created");

      // Create the ACP connection — the SDK manages JSON-RPC routing
      acpStartupLog("creating AgentSideConnection");
      const connection = new AgentSideConnection(
        (conn) => createMasonAcpAgent(conn),
        stream,
      );
      acpStartupLog("AgentSideConnection created, awaiting connection.closed");

      // Keep the process alive until the connection closes
      try {
        await connection.closed;
      } finally {
        acpStartupLog("connection closed, cleaning up");
        closeAcpLogger();
      }
    });
}
