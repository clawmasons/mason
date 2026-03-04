import type { Command } from "commander";
import { registerBuildCommand } from "./build.js";
import { registerInitCommand } from "./init.js";
import { registerInstallCommand } from "./install.js";
import { registerListCommand } from "./list.js";
import { registerPermissionsCommand } from "./permissions.js";
import { registerRunCommand } from "./run.js";
import { registerStopCommand } from "./stop.js";
import { registerValidateCommand } from "./validate.js";

export function registerCommands(program: Command): void {
  registerBuildCommand(program);
  registerInitCommand(program);
  registerInstallCommand(program);
  registerListCommand(program);
  registerPermissionsCommand(program);
  registerRunCommand(program);
  registerStopCommand(program);
  registerValidateCommand(program);
}
