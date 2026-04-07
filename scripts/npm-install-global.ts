#!/usr/bin/env tsx
/**
 * Package all mason workspace packages as tarballs and install them
 * globally so the real `mason` binary lands on PATH.
 *
 * Passing all six tarballs to `npm install -g` in one invocation lets npm
 * resolve inter-package deps (e.g. `@clawmasons/shared@^0.1.6`) from the
 * local tarballs rather than the public registry.
 *
 * Usage:
 *   npx tsx scripts/npm-install-global.ts
 *
 * After a successful install, the absolute path to the installed entry JS
 * is printed — capture it into MASON_BIN to run the existing e2e suite
 * against the globally installed binary.
 */

import { execFileSync, execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MONOREPO_ROOT = path.resolve(__dirname, "..");

// Workspace packages to pack, in dependency order (for log clarity — npm
// handles real resolution when all tarballs are passed together).
const PACKAGES = [
  "shared",
  "proxy",
  "agent-sdk",
  "agent-entry",
  "cli",
] as const;

const TARBALL_DIR = path.join(os.tmpdir(), "mason-tarballs");

function log(msg: string): void {
  console.log(`[npm-install-global] ${msg}`);
}

function run(cmd: string, args: string[], cwd: string): void {
  execFileSync(cmd, args, { cwd, stdio: "inherit" });
}

// ── 1. Build ────────────────────────────────────────────────────────────
log("Building all packages...");
run("npm", ["run", "build"], MONOREPO_ROOT);

// ── 2. Reset tarball directory ──────────────────────────────────────────
log(`Resetting tarball dir: ${TARBALL_DIR}`);
fs.rmSync(TARBALL_DIR, { recursive: true, force: true });
fs.mkdirSync(TARBALL_DIR, { recursive: true });

// ── 3. Pack each package ────────────────────────────────────────────────
const tarballs: string[] = [];
for (const pkg of PACKAGES) {
  const pkgDir = path.join(MONOREPO_ROOT, "packages", pkg);
  log(`Packing @clawmasons/${pkg}...`);
  const output = execFileSync(
    "npm",
    ["pack", "--pack-destination", TARBALL_DIR],
    { cwd: pkgDir, encoding: "utf-8" },
  );
  // `npm pack` prints the tarball filename on the last non-empty line.
  const lines = output.trim().split("\n").filter(Boolean);
  const tarballName = lines[lines.length - 1].trim();
  const tarballPath = path.join(TARBALL_DIR, tarballName);
  if (!fs.existsSync(tarballPath)) {
    throw new Error(
      `npm pack reported ${tarballName} but it is not in ${TARBALL_DIR}`,
    );
  }
  tarballs.push(tarballPath);
}

// ── 4. Install all tarballs globally at once ────────────────────────────
log(`Installing ${tarballs.length} tarballs globally...`);
run("npm", ["install", "-g", ...tarballs], MONOREPO_ROOT);

// ── 5. Verify `mason` is on PATH ────────────────────────────────────────
log("Verifying `mason --version`...");
const versionOut = execFileSync("mason", ["--version"], { encoding: "utf-8" }).trim();
log(`mason --version => ${versionOut}`);

// ── 6. Print the global entry-JS path ───────────────────────────────────
const npmRootG = execSync("npm root -g", { encoding: "utf-8" }).trim();
const masonBinJs = path.join(npmRootG, "@clawmasons", "mason", "dist", "cli", "bin.js");
if (!fs.existsSync(masonBinJs)) {
  throw new Error(`Expected mason entry JS not found at ${masonBinJs}`);
}
log("Global install complete.");
log(`MASON_BIN=${masonBinJs}`);
console.log(masonBinJs);
