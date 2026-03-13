import { build } from "esbuild";

await build({
  entryPoints: ["src/cli/proxy-entry.ts"],
  bundle: true,
  outfile: "dist/proxy-bundle.cjs",
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: true,
  minify: false,
  external: [
    // Native addon — must be resolved from node_modules at runtime
    "better-sqlite3",
  ],
});

console.log("Built dist/proxy-bundle.cjs");
