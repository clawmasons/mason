#!/usr/bin/env tsx
/**
 * Developer convenience script: spin up a test workspace with the
 * `claude-test-project` fixture and all available agents symlinked in.
 *
 * Usage:
 *   npx tsx scripts/create-test-dir.ts [output-dir]
 *
 * If no output dir is given, creates a timestamped temp directory.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import {
  copyFixtureWorkspace,
  installLocalAgent,
  PROJECT_ROOT,
} from "../packages/agent-sdk/src/testing/index.js";

// ── Parse args ──────────────────────────────────────────────────────────

const outputArg = process.argv[2];

// ── Create workspace from fixture ───────────────────────────────────────

let workspaceDir = copyFixtureWorkspace("test-dir");

if (outputArg) {
  const resolved = path.resolve(outputArg);
  if (fs.existsSync(resolved)) {
    console.error(`Error: output directory already exists: ${resolved}`);
    process.exit(1);
  }
  fs.renameSync(workspaceDir, resolved);
  workspaceDir = resolved;
}

// ── Link built-in monorepo agent ────────────────────────────────────────

const linkedAgents: string[] = [];

const mcpAgentDir = path.join(PROJECT_ROOT, "packages", "mcp-agent");
try {
  installLocalAgent(workspaceDir, mcpAgentDir);
  linkedAgents.push("@clawmasons/mcp-agent");
} catch (err) {
  console.warn(`Warning: failed to link mcp-agent: ${err}`);
}

// ── Link installed agents from .mason/node_modules/@clawmasons/ ─────────

const installedScopeDir = path.join(
  PROJECT_ROOT,
  ".mason",
  "node_modules",
  "@clawmasons",
);

if (fs.existsSync(installedScopeDir)) {
  for (const entry of fs.readdirSync(installedScopeDir)) {
    const pkgDir = path.join(installedScopeDir, entry);

    let stat: fs.Stats;
    try {
      stat = fs.statSync(pkgDir); // follows symlinks
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    const pkgJsonPath = path.join(pkgDir, "package.json");
    if (!fs.existsSync(pkgJsonPath)) continue;

    try {
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
      const mason = pkgJson.mason;
      if (!mason || typeof mason !== "object" || mason.type !== "agent") {
        continue;
      }

      const name: string = pkgJson.name ?? `@clawmasons/${entry}`;
      installLocalAgent(workspaceDir, pkgDir);
      linkedAgents.push(name);
    } catch (err) {
      console.warn(`Warning: skipping ${entry}: ${err}`);
    }
  }
}

// ── Summary ─────────────────────────────────────────────────────────────

console.log(`\nWorkspace created: ${workspaceDir}`);
console.log(`Linked agents (${linkedAgents.length}):`);
for (const name of linkedAgents) {
  console.log(`  - ${name}`);
}
console.log(`\nUsage:\n  node scripts/mason.js run --workspace ${workspaceDir}`);
