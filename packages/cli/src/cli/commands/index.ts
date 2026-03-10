import { Command } from "commander";
import { registerAddCommand } from "./add.js";
import { registerBuildCommand } from "./build.js";
import { registerInitCommand } from "./init.js";
import { registerInitRoleCommand } from "./init-role.js";
import { registerListCommand } from "./list.js";
import { registerLodgeInitCommand } from "./lodge-init.js";
import { registerPackCommand } from "./pack.js";
import { registerPermissionsCommand } from "./permissions.js";
import { registerProxyCommand } from "./proxy.js";
import { registerRemoveCommand } from "./remove.js";
import { registerRunAcpAgentCommand } from "./run-acp-agent.js";
import { registerRunAgentCommand } from "./run-agent.js";
import { registerValidateCommand } from "./validate.js";

/**
 * Register all chapter workspace subcommands under the `chapter` subcommand group,
 * and register top-level commands (`init`, `agent`, `acp`).
 */
export function registerCommands(program: Command): void {
  // ── Top-level commands ──────────────────────────────────────────────

  // `init` — lodge initialization
  registerLodgeInitCommand(program);

  // `agent` — renamed from `run-agent`
  registerRunAgentCommand(program);

  // `acp` — renamed from `run-acp-agent`
  registerRunAcpAgentCommand(program);

  // ── `chapter` subcommand group ──────────────────────────────────────

  const chapter = program
    .command("chapter")
    .description("Chapter workspace management commands");

  registerInitCommand(chapter);
  registerBuildCommand(chapter);
  registerInitRoleCommand(chapter);
  registerListCommand(chapter);
  registerValidateCommand(chapter);
  registerPermissionsCommand(chapter);
  registerPackCommand(chapter);
  registerAddCommand(chapter);
  registerRemoveCommand(chapter);
  registerProxyCommand(chapter);
}
