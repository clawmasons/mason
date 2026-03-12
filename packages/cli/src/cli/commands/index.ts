import { Command, type ParseOptions } from "commander";
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
import { registerRunCommand, isKnownAgentType } from "./run-agent.js";
import { registerMasonInitRepoCommand } from "./mason-init-repo.js";
import { registerValidateCommand } from "./validate.js";

/**
 * Register all chapter workspace subcommands under the `chapter` subcommand group,
 * and register top-level commands (`init`, `run`).
 *
 * Also installs shorthand detection: if the first positional argument is a known
 * agent type (e.g., `clawmasons claude --role x`), it is treated as
 * `clawmasons run claude --role x`.
 */
export function registerCommands(program: Command): void {
  // ── Top-level commands ──────────────────────────────────────────────

  // `init` — lodge initialization
  registerLodgeInitCommand(program);

  // `run` — run a role on an agent runtime (also registers hidden `agent` alias)
  registerRunCommand(program);

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

  // ── `mason` subcommand group ──────────────────────────────────────────

  const mason = program
    .command("mason")
    .description("Mason role management commands");

  registerMasonInitRepoCommand(mason);

  // ── Shorthand detection ─────────────────────────────────────────────
  // If the first argument is a known agent type but not a registered command,
  // rewrite `clawmasons <agent-type> ...` to `clawmasons run <agent-type> ...`
  installAgentTypeShorthand(program);
}

/**
 * Install a pre-parse hook that detects when the first argument is a known
 * agent type (e.g., `clawmasons claude --role x`) and rewrites it to
 * `clawmasons run claude --role x`.
 */
function installAgentTypeShorthand(program: Command): void {
  // Collect the names of all registered commands (including subcommands)
  const getKnownCommandNames = (): Set<string> => {
    const names = new Set<string>();
    for (const cmd of program.commands) {
      names.add(cmd.name());
      for (const alias of cmd.aliases()) {
        names.add(alias);
      }
    }
    return names;
  };

  // Hook into the pre-parse phase by overriding parse/parseAsync.
  const originalParseAsync = program.parseAsync.bind(program);
  program.parseAsync = async (argv?: readonly string[], parseOptions?: ParseOptions) => {
    const args = argv ? [...argv] : [...process.argv];
    const fromMode = parseOptions?.from ?? "node";
    const userArgStart = fromMode === "user" ? 0 : 2;

    if (args.length > userArgStart) {
      const firstArg = args[userArgStart];
      if (firstArg && !firstArg.startsWith("-")) {
        const knownCommands = getKnownCommandNames();
        if (!knownCommands.has(firstArg) && isKnownAgentType(firstArg)) {
          args.splice(userArgStart, 0, "run");
        }
      }
    }

    return originalParseAsync(args, parseOptions);
  };

  const originalParse = program.parse.bind(program);
  program.parse = (argv?: readonly string[], parseOptions?: ParseOptions) => {
    const args = argv ? [...argv] : [...process.argv];
    const fromMode = parseOptions?.from ?? "node";
    const userArgStart = fromMode === "user" ? 0 : 2;

    if (args.length > userArgStart) {
      const firstArg = args[userArgStart];
      if (firstArg && !firstArg.startsWith("-")) {
        const knownCommands = getKnownCommandNames();
        if (!knownCommands.has(firstArg) && isKnownAgentType(firstArg)) {
          args.splice(userArgStart, 0, "run");
        }
      }
    }

    return originalParse(args, parseOptions);
  };
}
