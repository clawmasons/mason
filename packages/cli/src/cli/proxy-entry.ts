#!/usr/bin/env node
/**
 * Direct entry point for the proxy server — bypasses Commander.js and
 * all other CLI command registrations so the esbuild bundle only pulls
 * in the proxy code path.  Used inside Docker containers for fast boot.
 */

import { startProxy } from "./commands/proxy.js";

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
