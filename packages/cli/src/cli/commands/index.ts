import type { Command } from "commander";
import { registerAddCommand } from "./add.js";
import { registerBuildCommand } from "./build.js";
import { registerInitCommand } from "./init.js";
import { registerInitRoleCommand } from "./init-role.js";
import { registerListCommand } from "./list.js";
import { registerPackCommand } from "./pack.js";
import { registerPermissionsCommand } from "./permissions.js";
import { registerProxyCommand } from "./proxy.js";
import { registerRemoveCommand } from "./remove.js";
import { registerRunAgentCommand } from "./run-agent.js";
import { registerValidateCommand } from "./validate.js";

export function registerCommands(program: Command): void {
  registerAddCommand(program);
  registerBuildCommand(program);
  registerInitCommand(program);
  registerInitRoleCommand(program);
  registerListCommand(program);
  registerPackCommand(program);
  registerPermissionsCommand(program);
  registerProxyCommand(program);
  registerRemoveCommand(program);
  registerRunAgentCommand(program);
  registerValidateCommand(program);
}
