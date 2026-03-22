import { Command, type ParseOptions } from "commander";
import { registerBuildCommand } from "./build.js";
import { registerListCommand } from "./list.js";
import { registerPackageCommand } from "./package.js";
import { registerPermissionsCommand } from "./permissions.js";
import { registerProxyCommand } from "./proxy.js";
import { registerRunCommand, registerConfigureCommand, isKnownAgentType, getKnownAgentTypeNames } from "./run-agent.js";
import { registerValidateCommand } from "./validate.js";
import { readConfigAgentNames, readConfigAliasNames } from "@clawmasons/agent-sdk";

/**
 * Register all workspace subcommands and top-level commands.
 *
 * Also installs shorthand detection: if the first positional argument is a known
 * agent type, config-declared agent name, or config-declared alias (e.g.,
 * `mason claude --role x`), it is treated as `mason run claude --role x`.
 */
export function registerCommands(program: Command): void {
  // Top-level commands
  registerRunCommand(program);
  registerConfigureCommand(program);
  registerPackageCommand(program);

  // Workspace management commands
  registerListCommand(program);
  registerValidateCommand(program);
  registerPermissionsCommand(program);
  registerBuildCommand(program);
  registerProxyCommand(program);

  // Read config-declared agent and alias names synchronously so shorthand
  // detection can recognise them before program.parse() fires.
  const configAgentNames = new Set(readConfigAgentNames(process.cwd()));
  const configAliasNames = new Set(readConfigAliasNames(process.cwd()));

  // Shorthand detection: rewrite `mason <agent> ...` to `mason run <agent> ...`
  installAgentTypeShorthand(program, configAgentNames, configAliasNames);
}

/**
 * Install a pre-parse hook that detects when the first argument is a known
 * agent type, config-declared agent name, or config-declared alias (e.g.,
 * `mason claude --role x`) and rewrites it to `mason run claude --role x`.
 *
 * When the first argument matches nothing, the CLI exits with an error listing
 * available commands, agent types, and configured aliases.
 */
function installAgentTypeShorthand(
  program: Command,
  configAgentNames: Set<string>,
  configAliasNames: Set<string>,
): void {
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

  const isShorthandTarget = (arg: string): boolean =>
    isKnownAgentType(arg) || configAgentNames.has(arg) || configAliasNames.has(arg);

  /**
   * Print an error listing available commands, agent types, and aliases,
   * then exit with code 1.
   */
  const exitWithUnknownCommand = (firstArg: string, knownCommands: Set<string>): void => {
    const commands = [...knownCommands].sort().join(", ");
    const agents = getKnownAgentTypeNames().join(", ");
    const aliases = [...configAliasNames].sort();
    let msg = `\n  Unknown command "${firstArg}".\n`;
    msg += `  Available commands: ${commands}\n`;
    msg += `  Available agents: ${agents}\n`;
    if (aliases.length > 0) {
      msg += `  Configured aliases: ${aliases.join(", ")}\n`;
    }
    console.error(msg);
    process.exit(1);
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
        if (!knownCommands.has(firstArg)) {
          if (isShorthandTarget(firstArg)) {
            args.splice(userArgStart, 0, "run");
          } else {
            exitWithUnknownCommand(firstArg, knownCommands);
          }
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
        if (!knownCommands.has(firstArg)) {
          if (isShorthandTarget(firstArg)) {
            args.splice(userArgStart, 0, "run");
          } else {
            exitWithUnknownCommand(firstArg, knownCommands);
          }
        }
      }
    }

    return originalParse(args, parseOptions);
  };
}
