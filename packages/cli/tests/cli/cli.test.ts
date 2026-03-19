import { describe, it, expect } from "vitest";
import { program } from "../../src/cli/index.js";

describe("CLI entry point", () => {
  it("has the correct program name", () => {
    expect(program.name()).toBe("mason");
  });

  it("has a version matching package.json", () => {
    expect(program.version()).toBe("0.1.2");
  });

  it("has a description", () => {
    expect(program.description()).toContain("Mason");
  });

  it("has top-level run command registered", () => {
    const runCmd = program.commands.find((cmd) => cmd.name() === "run");
    expect(runCmd).toBeDefined();
    if (runCmd) {
      expect(runCmd.description()).toContain("Run a role");
    }
  });

  it("does not have a hidden agent command (agent type removed)", () => {
    const agentCmd = program.commands.find((cmd) => cmd.name() === "agent");
    expect(agentCmd).toBeUndefined();
  });

  it("does not have a separate top-level acp command (consolidated into run --acp)", () => {
    const acpCmd = program.commands.find((cmd) => cmd.name() === "acp");
    expect(acpCmd).toBeUndefined();
  });

  it("has chapter subcommand group registered", () => {
    const chapterCmd = program.commands.find((cmd) => cmd.name() === "chapter");
    expect(chapterCmd).toBeDefined();
    if (chapterCmd) {
      expect(chapterCmd.description()).toContain("Chapter workspace");
    }
  });

  it("chapter subcommand contains build, list, validate, permissions, proxy", () => {
    const chapterCmd = program.commands.find((cmd) => cmd.name() === "chapter");
    expect(chapterCmd).toBeDefined();
    if (chapterCmd) {
      const subcommandNames = chapterCmd.commands.map((cmd) => cmd.name());
      expect(subcommandNames).toContain("build");
      expect(subcommandNames).toContain("list");
      expect(subcommandNames).toContain("validate");
      expect(subcommandNames).toContain("permissions");
      expect(subcommandNames).toContain("proxy");
      // Removed commands
      expect(subcommandNames).not.toContain("add");
      expect(subcommandNames).not.toContain("pack");
      expect(subcommandNames).not.toContain("remove");
      expect(subcommandNames).not.toContain("init-role");
      expect(subcommandNames).not.toContain("init");
    }
  });

  it("has top-level package command registered", () => {
    const packageCmd = program.commands.find((cmd) => cmd.name() === "package");
    expect(packageCmd).toBeDefined();
    if (packageCmd) {
      expect(packageCmd.description()).toContain("pack");
    }
  });

  it("does not have deprecated commands at top level", () => {
    const topLevelNames = program.commands.map((cmd) => cmd.name());
    expect(topLevelNames).not.toContain("run-agent");
    expect(topLevelNames).not.toContain("run-acp-agent");
    expect(topLevelNames).not.toContain("run-init");
    expect(topLevelNames).not.toContain("docker-init");
    expect(topLevelNames).not.toContain("build");
    expect(topLevelNames).not.toContain("list");
    expect(topLevelNames).not.toContain("validate");
  });

  it("run command has --role option", () => {
    const runCmd = program.commands.find((cmd) => cmd.name() === "run");
    expect(runCmd).toBeDefined();
    if (runCmd) {
      const roleOption = runCmd.options.find((opt) => opt.long === "--role");
      expect(roleOption).toBeDefined();
    }
  });

  it("run command has --acp option", () => {
    const runCmd = program.commands.find((cmd) => cmd.name() === "run");
    expect(runCmd).toBeDefined();
    if (runCmd) {
      const acpOption = runCmd.options.find((opt) => opt.long === "--acp");
      expect(acpOption).toBeDefined();
    }
  });

  it("run command accepts agent positional argument", () => {
    const runCmd = program.commands.find((cmd) => cmd.name() === "run");
    expect(runCmd).toBeDefined();
    if (runCmd) {
      // Commander stores registered arguments
      const args = runCmd.registeredArguments ?? [];
      expect(args.length).toBeGreaterThanOrEqual(1);
      expect(args[0]?.name()).toBe("agent");
    }
  });

  it("run command has --agent option", () => {
    const runCmd = program.commands.find((cmd) => cmd.name() === "run");
    expect(runCmd).toBeDefined();
    if (runCmd) {
      const agentOpt = runCmd.options.find((opt) => opt.long === "--agent");
      expect(agentOpt).toBeDefined();
    }
  });

  it("run command has --home option", () => {
    const runCmd = program.commands.find((cmd) => cmd.name() === "run");
    expect(runCmd).toBeDefined();
    if (runCmd) {
      const homeOpt = runCmd.options.find((opt) => opt.long === "--home");
      expect(homeOpt).toBeDefined();
    }
  });

  it("run command has --terminal option", () => {
    const runCmd = program.commands.find((cmd) => cmd.name() === "run");
    expect(runCmd).toBeDefined();
    if (runCmd) {
      const terminalOpt = runCmd.options.find((opt) => opt.long === "--terminal");
      expect(terminalOpt).toBeDefined();
    }
  });

  it("run command does not have --agent-type option (renamed to --agent)", () => {
    const runCmd = program.commands.find((cmd) => cmd.name() === "run");
    expect(runCmd).toBeDefined();
    if (runCmd) {
      const agentTypeOpt = runCmd.options.find((opt) => opt.long === "--agent-type");
      expect(agentTypeOpt).toBeUndefined();
    }
  });

  it("has top-level configure command registered", () => {
    const configureCmd = program.commands.find((cmd) => cmd.name() === "configure");
    expect(configureCmd).toBeDefined();
  });

  it("configure command does not have --role option", () => {
    const configureCmd = program.commands.find((cmd) => cmd.name() === "configure");
    expect(configureCmd).toBeDefined();
    if (configureCmd) {
      const roleOption = configureCmd.options.find((opt) => opt.long === "--role");
      expect(roleOption).toBeUndefined();
    }
  });
});
