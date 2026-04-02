import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

const root = resolve(__dirname, "../..");

export default defineConfig({
  resolve: {
    alias: {
      "@clawmasons/agent-sdk/testing": resolve(root, "packages/agent-sdk/src/testing/index.ts"),
      "@clawmasons/agent-sdk": resolve(root, "packages/agent-sdk/src/index.ts"),
      "@clawmasons/shared": resolve(root, "packages/shared/src/index.ts"),
    },
  },
  test: {
    include: ["tests/e2e/**/*.test.ts"],
    testTimeout: 60_000,
    fileParallelism: false,
    pool: "forks",
    globalTeardown: ["tests/e2e/global-teardown.ts"],
  },
});
