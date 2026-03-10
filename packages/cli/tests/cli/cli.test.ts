import { describe, it, expect } from "vitest";
import { program } from "../../src/cli/index.js";

describe("CLI entry point", () => {
  it("has the correct program name", () => {
    expect(program.name()).toBe("clawmasons");
  });

  it("has a version matching package.json", () => {
    expect(program.version()).toBe("0.1.0");
  });

  it("has a description", () => {
    expect(program.description()).toContain("Clawmasons Chapter");
  });

  it("has top-level init command registered", () => {
    const initCmd = program.commands.find((cmd) => cmd.name() === "init");
    expect(initCmd).toBeDefined();
    if (initCmd) {
      expect(initCmd.description()).toContain("lodge");
    }
  });

  it("has top-level agent command registered", () => {
    const agentCmd = program.commands.find((cmd) => cmd.name() === "agent");
    expect(agentCmd).toBeDefined();
    if (agentCmd) {
      expect(agentCmd.description()).toContain("agent");
    }
  });

  it("has top-level acp command registered", () => {
    const acpCmd = program.commands.find((cmd) => cmd.name() === "acp");
    expect(acpCmd).toBeDefined();
    if (acpCmd) {
      expect(acpCmd.description()).toContain("ACP");
    }
  });

  it("has chapter subcommand group registered", () => {
    const chapterCmd = program.commands.find((cmd) => cmd.name() === "chapter");
    expect(chapterCmd).toBeDefined();
    if (chapterCmd) {
      expect(chapterCmd.description()).toContain("Chapter workspace");
    }
  });

  it("chapter subcommand contains init", () => {
    const chapterCmd = program.commands.find((cmd) => cmd.name() === "chapter");
    expect(chapterCmd).toBeDefined();
    if (chapterCmd) {
      const initCmd = chapterCmd.commands.find((cmd) => cmd.name() === "init");
      expect(initCmd).toBeDefined();
      if (initCmd) {
        expect(initCmd.description()).toContain("Initialize");
      }
    }
  });

  it("chapter init has --name option", () => {
    const chapterCmd = program.commands.find((cmd) => cmd.name() === "chapter");
    expect(chapterCmd).toBeDefined();
    if (chapterCmd) {
      const initCmd = chapterCmd.commands.find((cmd) => cmd.name() === "init");
      expect(initCmd).toBeDefined();
      if (initCmd) {
        const nameOption = initCmd.options.find((opt) => opt.long === "--name");
        expect(nameOption).toBeDefined();
      }
    }
  });

  it("chapter subcommand contains build, list, validate, add, remove", () => {
    const chapterCmd = program.commands.find((cmd) => cmd.name() === "chapter");
    expect(chapterCmd).toBeDefined();
    if (chapterCmd) {
      const subcommandNames = chapterCmd.commands.map((cmd) => cmd.name());
      expect(subcommandNames).toContain("build");
      expect(subcommandNames).toContain("list");
      expect(subcommandNames).toContain("validate");
      expect(subcommandNames).toContain("add");
      expect(subcommandNames).toContain("remove");
      expect(subcommandNames).toContain("init-role");
      expect(subcommandNames).toContain("permissions");
      expect(subcommandNames).toContain("pack");
      expect(subcommandNames).toContain("proxy");
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
});
