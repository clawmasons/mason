import type { Command } from "commander";
import * as path from "node:path";
import { updateAgentStatus } from "../../registry/members.js";

export function registerEnableCommand(program: Command): void {
  program
    .command("enable")
    .description("Enable an installed agent")
    .argument("<agent>", "Agent slug to enable (e.g., @note-taker)")
    .action(async (agentArg: string) => {
      runEnable(process.cwd(), agentArg);
    });
}

export function runEnable(rootDir: string, agentArg: string): void {
  const slug = agentArg.replace(/^@/, "");
  const chapterDir = path.join(rootDir, ".chapter");

  try {
    updateAgentStatus(chapterDir, slug, "enabled");
    console.log(`\n✔ Agent @${slug} enabled\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n✘ ${message}\n`);
    process.exit(1);
  }
}
