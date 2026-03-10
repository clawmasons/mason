import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@clawmasons/shared": resolve(__dirname, "packages/shared/src/index.ts"),
      "@clawmasons/proxy": resolve(__dirname, "packages/proxy/src/index.ts"),
      "@clawmasons/credential-service": resolve(__dirname, "packages/credential-service/src/index.ts"),
      "@clawmasons/agent-entry": resolve(__dirname, "packages/agent-entry/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/tests/**/*.test.ts"],
  },
});
