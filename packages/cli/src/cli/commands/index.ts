import type { Command } from "commander";
import { registerAddCommand } from "./add.js";
import { registerBuildCommand } from "./build.js";
import { registerDockerInitCommand } from "./docker-init.js";
import { registerInitCommand } from "./init.js";
import { registerListCommand } from "./list.js";
import { registerPermissionsCommand } from "./permissions.js";
import { registerProxyCommand } from "./proxy.js";
import { registerRemoveCommand } from "./remove.js";
import { registerValidateCommand } from "./validate.js";

export function registerCommands(program: Command): void {
  registerAddCommand(program);
  registerBuildCommand(program);
  registerDockerInitCommand(program);
  registerInitCommand(program);
  registerListCommand(program);
  registerPermissionsCommand(program);
  registerProxyCommand(program);
  registerRemoveCommand(program);
  registerValidateCommand(program);
}
