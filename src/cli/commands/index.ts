import type { Command } from "commander";
import { registerInitCommand } from "./init.js";
import { registerInstallCommand } from "./install.js";
import { registerValidateCommand } from "./validate.js";

export function registerCommands(program: Command): void {
  registerInitCommand(program);
  registerInstallCommand(program);
  registerValidateCommand(program);
}
