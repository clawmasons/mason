#!/usr/bin/env node
/**
 * Direct entry point for the proxy server — bypasses Commander.js and
 * all other CLI command registrations so the esbuild bundle only pulls
 * in the proxy code path.  Used inside Docker containers for fast boot.
 */

import { createWriteStream, existsSync } from "node:fs";
import { format } from "node:util";
import { startProxy } from "./commands/proxy.js";
import { setLocalAuditPath } from "@clawmasons/proxy";

// ── File logging (Docker containers only) ────────────────────────────

const MASON_LOGS_DIR = "/mason-logs";
if (existsSync(MASON_LOGS_DIR)) {
  const logStream = createWriteStream(`${MASON_LOGS_DIR}/proxy.log`, { flags: "a" });
  const origLog = console.log;
  const origError = console.error;
  console.log = (...args: unknown[]) => {
    origLog(...args);
    logStream.write(`${new Date().toISOString()} [INFO] ${format(...args)}\n`);
  };
  console.error = (...args: unknown[]) => {
    origError(...args);
    logStream.write(`${new Date().toISOString()} [ERROR] ${format(...args)}\n`);
  };
  setLocalAuditPath(`${MASON_LOGS_DIR}/audit.log`);
}

// ── Minimal arg parsing (no Commander overhead) ──────────────────────

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx !== -1 && idx + 1 < process.argv.length
    ? process.argv[idx + 1]
    : undefined;
}

startProxy(process.cwd(), {
  agent: getArg("--agent"),
  role: getArg("--role"),
  port: getArg("--port"),
  transport: getArg("--transport"),
  startupTimeout: getArg("--startup-timeout"),
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
