/**
 * Global setup for e2e tests.
 *
 * Removes the tmp/clawmasons directory before each test run
 * so that Docker images are rebuilt from fresh packages.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_CLAWMASONS = path.join(__dirname, "tmp", "clawmasons");

export default function globalSetup(): void {
  if (fs.existsSync(TMP_CLAWMASONS)) {
    // Use shell rm -rf — fs.rmSync can fail with ENOTEMPTY on macOS
    // when node_modules directories have many nested entries.
    execSync(`rm -rf "${TMP_CLAWMASONS}"`, { stdio: "pipe" });
  }
}
