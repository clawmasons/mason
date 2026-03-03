import type { Command } from "commander";
import { registerInitCommand } from "./init.js";
import { registerValidateCommand } from "./validate.js";

export function registerCommands(program: Command): void {
  registerInitCommand(program);
  registerValidateCommand(program);
}
