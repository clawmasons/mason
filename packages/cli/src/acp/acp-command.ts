import type { Command } from "commander";
import { Readable, Writable } from "node:stream";
import { AgentSideConnection, ndJsonStream } from "@agentclientprotocol/sdk";
import { createMasonAcpAgent } from "./acp-agent.js";
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
    .action(async () => {
      acpStartupLog("acp command action entered", { pid: process.pid, argv: process.argv });

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
