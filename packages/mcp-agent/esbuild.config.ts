import { build } from "esbuild";

// Build the CLI binary (bundled)
await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  outfile: "dist/mcp-agent.js",
  platform: "node",
  target: "node22",
  format: "esm",
  banner: {
    js: "#!/usr/bin/env node",
  },
  sourcemap: true,
  minify: false,
});

console.log("Built dist/mcp-agent.js");

// Build the agent-package export (unbundled — relies on workspace dependencies)
await build({
  entryPoints: ["src/agent-package.ts"],
  bundle: false,
  outfile: "dist/agent-package.js",
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  minify: false,
});

// Also build the materializer (dependency of agent-package)
await build({
  entryPoints: ["src/materializer.ts"],
  bundle: false,
  outfile: "dist/materializer.js",
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  minify: false,
});

console.log("Built dist/agent-package.js");
