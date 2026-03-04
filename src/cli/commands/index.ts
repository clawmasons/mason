import type { Command } from "commander";
import { registerAddCommand } from "./add.js";
import { registerBuildCommand } from "./build.js";
import { registerInitCommand } from "./init.js";
import { registerInstallCommand } from "./install.js";
import { registerListCommand } from "./list.js";
import { registerPermissionsCommand } from "./permissions.js";
import { registerRemoveCommand } from "./remove.js";
import { registerRunCommand } from "./run.js";
import { registerStopCommand } from "./stop.js";
import { registerValidateCommand } from "./validate.js";

export function registerCommands(program: Command): void {
  registerAddCommand(program);
  registerBuildCommand(program);
  registerInitCommand(program);
  registerInstallCommand(program);
  registerListCommand(program);
  registerPermissionsCommand(program);
  registerRemoveCommand(program);
  registerRunCommand(program);
  registerStopCommand(program);
  registerValidateCommand(program);
}
