import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  outfile: "dist/agent-entry.js",
  platform: "node",
  target: "node22",
  format: "esm",
  banner: {
    js: "#!/usr/bin/env node",
  },
  sourcemap: true,
  minify: false,
});

console.log("Built dist/agent-entry.js");
