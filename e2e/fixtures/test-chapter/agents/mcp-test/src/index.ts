/**
 * MCP Test Agent — delegates to @clawmasons/mcp-agent package.
 *
 * This fixture wraps the shared mcp-agent package so it can be used
 * as a chapter agent in the test workspace. The agent metadata
 * (credentials, runtimes, roles) is declared in package.json.
 */

import { main } from "@clawmasons/mcp-agent";

main().catch((err) => {
  console.error("[mcp-test] Fatal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
