import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@clawmasons/shared": resolve(__dirname, "..", "packages/shared/src/index.ts"),
      "@clawmasons/proxy": resolve(__dirname, "..", "packages/proxy/src/index.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 60_000,
    fileParallelism: false,
    pool: "forks",
  },
});
