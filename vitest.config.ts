import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@clawmasons/shared": resolve(__dirname, "packages/shared/src/index.ts"),
      "@clawmasons/proxy": resolve(__dirname, "packages/proxy/src/index.ts"),

      "@clawmasons/agent-entry": resolve(__dirname, "packages/agent-entry/src/index.ts"),
      "@clawmasons/agent-sdk": resolve(__dirname, "packages/agent-sdk/src/index.ts"),
      "@clawmasons/claude-code-agent": resolve(__dirname, "packages/claude-code-agent/src/index.ts"),
      "@clawmasons/pi-coding-agent": resolve(__dirname, "packages/pi-coding-agent/src/index.ts"),
      "@clawmasons/mcp-agent/agent-package": resolve(__dirname, "packages/mcp-agent/src/agent-package.ts"),
      "@clawmasons/mcp-agent": resolve(__dirname, "packages/mcp-agent/src/index.ts"),
      "@clawmasons/codex-agent": resolve(__dirname, "packages/agents/codex-agent/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/tests/**/*.test.ts", "packages/agents/*/tests/**/*.test.ts"],
    exclude: ["packages/*/tests/e2e/**/*.test.ts", "packages/agents/*/tests/e2e/**/*.test.ts", "node_modules"],
    setupFiles: [resolve(__dirname, "packages/shared/tests/setup-dialects.ts")],
  },
});
