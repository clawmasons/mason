import type { Command } from "commander";
import { registerInitCommand } from "./init.js";

export function registerCommands(program: Command): void {
  registerInitCommand(program);
}
