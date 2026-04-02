import type { Command } from "commander";

// ── Command Registration ──────────────────────────────────────────────

/**
 * Register the `mason proxy` CLI command.
 *
 * In production (Docker containers), the proxy runs via `proxy-entry.ts`
 * which reads `proxy-config.json` directly. This command exists for
 * backward compatibility and local testing.
 */
export function registerProxyCommand(program: Command): void {
  program
    .command("proxy")
    .description("Start the MCP proxy server for a role (reads proxy-config.json from cwd)")
    .option("--port <number>", "Port to listen on (default: 9090)")
    .option("--startup-timeout <seconds>", "Upstream server startup timeout in seconds (default: 60)")
    .option("--transport <type>", "Transport type: sse or streamable-http (default: sse)")
    .action(async () => {
      // Delegate to the same config-based startup used by proxy-entry.ts
      console.error(
        "mason proxy now requires a proxy-config.json file.\n" +
        "Use `mason build` to generate Docker artifacts, or run the proxy\n" +
        "inside a Docker container where proxy-config.json is provided.",
      );
      process.exit(1);
    });
}
