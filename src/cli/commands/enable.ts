import type { Command } from "commander";
import * as path from "node:path";
import { updateMemberStatus } from "../../registry/members.js";

export function registerEnableCommand(program: Command): void {
  program
    .command("enable")
    .description("Enable an installed member")
    .argument("<member>", "Member slug to enable (e.g., @note-taker)")
    .action(async (memberArg: string) => {
      runEnable(process.cwd(), memberArg);
    });
}

export function runEnable(rootDir: string, memberArg: string): void {
  const slug = memberArg.replace(/^@/, "");
  const chapterDir = path.join(rootDir, ".chapter");

  try {
    updateMemberStatus(chapterDir, slug, "enabled");
    console.log(`\n✔ Member @${slug} enabled\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n✘ ${message}\n`);
    process.exit(1);
  }
}
