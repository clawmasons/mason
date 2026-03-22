import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@clawmasons/agent-sdk/testing": resolve(__dirname, "packages/agent-sdk/src/testing/index.ts"),
      "@clawmasons/agent-sdk": resolve(__dirname, "packages/agent-sdk/src/index.ts"),
      "@clawmasons/shared": resolve(__dirname, "packages/shared/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/tests/e2e/**/*.test.ts"],
    testTimeout: 60_000,
    fileParallelism: false,
    pool: "forks",
  },
});
