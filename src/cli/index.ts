import { Command } from "commander";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerCommands } from "./commands/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "../../package.json"), "utf-8"),
) as { version: string };

const program = new Command();

program
  .name("forge")
  .version(pkg.version)
  .description(
    "Agent Forge System — AI agent packaging, governance, and runtime orchestration",
  );

registerCommands(program);

export { program };

export function run(): void {
  program.parse();
}
