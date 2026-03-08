import type { Command } from "commander";
import * as path from "node:path";
import { updateAgentStatus } from "../../registry/members.js";

export function registerDisableCommand(program: Command): void {
  program
    .command("disable")
    .description("Disable an installed agent")
    .argument("<agent>", "Agent slug to disable (e.g., @note-taker)")
    .action(async (agentArg: string) => {
      runDisable(process.cwd(), agentArg);
    });
}

export function runDisable(rootDir: string, agentArg: string): void {
  const slug = agentArg.replace(/^@/, "");
  const chapterDir = path.join(rootDir, ".chapter");

  try {
    updateAgentStatus(chapterDir, slug, "disabled");
    console.log(`\n✔ Agent @${slug} disabled\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n✘ ${message}\n`);
    process.exit(1);
  }
}
