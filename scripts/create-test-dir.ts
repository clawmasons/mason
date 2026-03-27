#!/usr/bin/env tsx
/**
 * Developer convenience script: spin up a test workspace with the
 * `claude-test-project` fixture.
 *
 * Agents are auto-linked by mason.js at runtime when it detects a .mason/
 * directory in the workspace, so no manual linking is needed here.
 *
 * Usage:
 *   npx tsx scripts/create-test-dir.ts [output-dir]
 *
 * If no output dir is given, creates a timestamped temp directory.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { copyFixtureWorkspace } from "../packages/agent-sdk/src/testing/index.js";

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

// ── Summary ─────────────────────────────────────────────────────────────

console.log(`\nWorkspace created: ${workspaceDir}`);
console.log(`Agents will be auto-linked by mason.js at runtime.`);
console.log(`\nUsage:\n  node scripts/mason.js run --workspace ${workspaceDir}`);
