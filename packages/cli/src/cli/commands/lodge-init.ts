import type { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ensureClawmasonsHome,
  getLodgeEntry,
  resolveLodgeVars,
  upsertLodgeEntry,
  writeConfigJson,
} from "../../runtime/home.js";

/**
 * Options accepted by the `clawmasons init` command.
 */
export interface LodgeInitOptions {
  lodge?: string;
  lodgeHome?: string;
  home?: string;
}

/**
 * Result returned by initLodge() for testability.
 */
export interface LodgeInitResult {
  skipped: boolean;
  clawmasonsHome: string;
  lodge: string;
  lodgeHome: string;
}

/**
 * Get the path to the charter template.
 */
function getCharterTemplatePath(): string {
  const thisFile = fileURLToPath(import.meta.url);
  // This file is at src/cli/commands/lodge-init.ts (or dist/cli/commands/lodge-init.js)
  // The project root is 3 levels up from the file's directory.
  const projectRoot = path.resolve(path.dirname(thisFile), "..", "..", "..");
  return path.join(projectRoot, "templates", "charter", "CHARTER.md");
}

/**
 * Core lodge initialization logic. Separated from Commander for testability.
 *
 * @param options - CLI options (lodge, lodgeHome, home)
 * @param deps - Injectable dependencies for testing
 * @returns Result indicating whether init was skipped or performed
 */
export function initLodge(
  options: LodgeInitOptions,
  deps?: { charterTemplatePath?: string },
): LodgeInitResult {
  const { clawmasonsHome, lodge, lodgeHome } = resolveLodgeVars(options);

  // 1. Ensure CLAWMASONS_HOME exists
  ensureClawmasonsHome(clawmasonsHome);

  // 2. Ensure config.json exists
  const configPath = path.join(clawmasonsHome, "config.json");
  if (!fs.existsSync(configPath)) {
    writeConfigJson(clawmasonsHome, {});
  }

  // 3. Check if lodge is already initialized (idempotent)
  const existingEntry = getLodgeEntry(clawmasonsHome, lodge);
  const chaptersDir = path.join(lodgeHome, "chapters");
  if (existingEntry && fs.existsSync(chaptersDir)) {
    return { skipped: true, clawmasonsHome, lodge, lodgeHome };
  }

  // 4. Create lodge directory structure
  fs.mkdirSync(chaptersDir, { recursive: true });

  // 5. Copy CHARTER.md (only if not already present)
  const charterDest = path.join(lodgeHome, "CHARTER.md");
  if (!fs.existsSync(charterDest)) {
    const charterSrc = deps?.charterTemplatePath ?? getCharterTemplatePath();
    const charterContent = fs.readFileSync(charterSrc, "utf-8");
    fs.writeFileSync(charterDest, charterContent, "utf-8");
  }

  // 6. Register lodge in config.json
  upsertLodgeEntry(clawmasonsHome, lodge, lodgeHome);

  return { skipped: false, clawmasonsHome, lodge, lodgeHome };
}

/**
 * Register the `clawmasons init` command.
 */
export function registerLodgeInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize a new lodge")
    .option("--lodge <name>", "Lodge name (overrides LODGE env var)")
    .option(
      "--lodge-home <path>",
      "Lodge home directory (overrides LODGE_HOME env var)",
    )
    .option(
      "--home <path>",
      "Clawmasons home directory (overrides CLAWMASONS_HOME env var)",
    )
    .action((opts: LodgeInitOptions) => {
      const result = initLodge(opts);

      if (result.skipped) {
        console.log(
          `\n  Lodge '${result.lodge}' already initialized at ${result.lodgeHome}. Skipping init.\n`,
        );
        return;
      }

      console.log(
        `\n  Lodge '${result.lodge}' initialized at ${result.lodgeHome}\n` +
          `\n  Next steps:\n` +
          `    clawmasons acp --chapter initiate --role chapter-creator\n`,
      );
    });
}
