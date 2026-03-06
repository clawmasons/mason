import type { Command } from "commander";
import * as path from "node:path";
import { updateMemberStatus } from "../../registry/members.js";

export function registerDisableCommand(program: Command): void {
  program
    .command("disable")
    .description("Disable an installed member")
    .argument("<member>", "Member slug to disable (e.g., @note-taker)")
    .action(async (memberArg: string) => {
      runDisable(process.cwd(), memberArg);
    });
}

export function runDisable(rootDir: string, memberArg: string): void {
  const slug = memberArg.replace(/^@/, "");
  const chapterDir = path.join(rootDir, ".chapter");

  try {
    updateMemberStatus(chapterDir, slug, "disabled");
    console.log(`\n✔ Member @${slug} disabled\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n✘ ${message}\n`);
    process.exit(1);
  }
}
