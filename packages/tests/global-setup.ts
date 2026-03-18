/**
 * Global setup for e2e tests.
 *
 * Removes the tmp/mason directory before each test run
 * so that Docker images are rebuilt from fresh packages.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_MASON = path.join(__dirname, "tmp", "mason");

export default function globalSetup(): void {
  if (fs.existsSync(TMP_MASON)) {
    // Use shell rm -rf — fs.rmSync can fail with ENOTEMPTY on macOS
    // when node_modules directories have many nested entries.
    execSync(`rm -rf "${TMP_MASON}"`, { stdio: "pipe" });
  }
}
