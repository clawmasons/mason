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
});

console.log("Built dist/proxy-bundle.cjs");
