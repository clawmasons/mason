#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../packages/cli/dist/cli/index.js";

// Set MASON_BIN so child processes (e.g. ACP prompt-executor) can find this script
// without requiring the env var to be set externally.
const __filename = fileURLToPath(import.meta.url);
process.env.MASON_BIN = __filename;

// Auto-link agents when CWD has a .mason/ directory (dev environments).
// Resolves the monorepo root from this script's location, then symlinks
// all agents from the sibling mason-extensions/agents/ repo.
const monorepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function linkDevAgents() {
  const masonDir = path.join(process.cwd(), ".mason");
  if (!fs.existsSync(masonDir)) return;

  const scopeDir = path.join(masonDir, "node_modules", "@clawmasons");

  function linkAgent(agentDir) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(agentDir, "package.json"), "utf-8"));
      if (!pkg.name) return;
      const parts = pkg.name.split("/");
      if (parts.length !== 2) return;
      fs.mkdirSync(scopeDir, { recursive: true });
      const target = path.join(scopeDir, parts[1]);
      const resolvedAgentDir = path.resolve(agentDir);
      try {
        const lstat = fs.lstatSync(target);
        if (lstat.isSymbolicLink()) {
          // Already a symlink — skip if pointing to the right place
          if (fs.readlinkSync(target) === resolvedAgentDir) return;
          fs.unlinkSync(target);
        } else {
          // Real directory (e.g. npm-installed) — replace with dev symlink
          fs.rmSync(target, { recursive: true, force: true });
        }
      } catch {
        // Target doesn't exist — will create below
      }
      fs.symlinkSync(resolvedAgentDir, target, "dir");
    } catch {
      // skip silently — agent may be missing package.json or be malformed
    }
  }

  // Sibling mason-extensions repo
  const extensionsDir = path.join(monorepoRoot, "..", "mason-extensions", "agents");
  if (fs.existsSync(extensionsDir)) {
    for (const entry of fs.readdirSync(extensionsDir)) {
      const agentDir = path.join(extensionsDir, entry);
      try {
        if (fs.statSync(agentDir).isDirectory()) {
          linkAgent(agentDir);
        }
      } catch {
        // skip entries that can't be stat'd
      }
    }
  }
}

// Run at startup (handles .mason/ already exists)
linkDevAgents();
// Store for later use (handles .mason/ created mid-flow by ensureMasonConfig)
globalThis.__masonDevLinker = linkDevAgents;

run();
