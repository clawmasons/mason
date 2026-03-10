import type { Command } from "commander";
import { registerAcpProxyCommand } from "./acp-proxy.js";
import { registerAddCommand } from "./add.js";
import { registerBuildCommand } from "./build.js";
import { registerDockerInitCommand } from "./docker-init.js";
import { registerInitCommand } from "./init.js";
import { registerListCommand } from "./list.js";
import { registerPackCommand } from "./pack.js";
import { registerPermissionsCommand } from "./permissions.js";
import { registerProxyCommand } from "./proxy.js";
import { registerRemoveCommand } from "./remove.js";
import { registerRunAgentCommand } from "./run-agent.js";
import { registerRunInitCommand } from "./run-init.js";
import { registerValidateCommand } from "./validate.js";

export function registerCommands(program: Command): void {
  registerAcpProxyCommand(program);
  registerAddCommand(program);
  registerBuildCommand(program);
  registerDockerInitCommand(program);
  registerInitCommand(program);
  registerListCommand(program);
  registerPackCommand(program);
  registerPermissionsCommand(program);
  registerProxyCommand(program);
  registerRemoveCommand(program);
  registerRunAgentCommand(program);
  registerRunInitCommand(program);
  registerValidateCommand(program);
}
