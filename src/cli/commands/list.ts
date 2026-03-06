import * as path from "node:path";
import type { Command } from "commander";
import { discoverPackages } from "../../resolver/discover.js";
import { resolveMember } from "../../resolver/resolve.js";
import type { ResolvedMember, ResolvedRole } from "../../resolver/types.js";
import { getAppShortName } from "../../generator/toolfilter.js";
import { readMembersRegistry } from "../../registry/members.js";
import type { MembersRegistry } from "../../registry/types.js";

interface ListOptions {
  json?: boolean;
}

export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description("List installed members and their dependency trees")
    .option("--json", "Output as JSON")
    .action(async (options: ListOptions) => {
      await runList(process.cwd(), options);
    });
}

export async function runList(
  rootDir: string,
  options: ListOptions,
): Promise<void> {
  try {
    // 1. Discover all packages
    const packages = discoverPackages(rootDir);

    // 2. Find all member packages
    const memberNames: string[] = [];
    for (const [name, pkg] of packages) {
      if (pkg.chapterField.type === "member") {
        memberNames.push(name);
      }
    }

    if (memberNames.length === 0) {
      console.error("No members found.");
      process.exit(1);
      return;
    }

    // 3. Resolve each member
    const members: ResolvedMember[] = [];
    for (const name of memberNames.sort()) {
      members.push(resolveMember(name, packages));
    }

    // 4. Read the members registry for status information
    const chapterDir = path.join(rootDir, ".chapter");
    const registry = readMembersRegistry(chapterDir);

    if (options.json) {
      console.log(JSON.stringify(members, null, 2));
      return;
    }

    // 5. Print tree for each member with status
    for (let i = 0; i < members.length; i++) {
      const member = members[i];
      if (i > 0) console.log("");
      const statusSuffix = formatMemberStatus(member, registry);
      console.log(`${member.name}@${member.version}${statusSuffix}`);
      printRoles(member.roles);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n✘ List failed: ${message}\n`);
    process.exit(1);
  }
}

/**
 * Format the member status suffix for display.
 * Shows "(memberType, status)" if the member is in the registry,
 * or "(memberType)" if the member is not installed.
 */
function formatMemberStatus(member: ResolvedMember, registry: MembersRegistry): string {
  const entry = registry.members[member.slug];
  if (entry) {
    return ` (${member.memberType}, ${entry.status})`;
  }
  return ` (${member.memberType})`;
}

function printRoles(roles: ResolvedRole[]): void {
  for (let i = 0; i < roles.length; i++) {
    const role = roles[i];
    const isLast = i === roles.length - 1;
    const prefix = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";

    console.log(`${prefix}role: ${getAppShortName(role.name)}@${role.version}`);

    const children: Array<{ label: string; isLast: boolean }> = [];

    for (const task of role.tasks) {
      children.push({ label: `task: ${getAppShortName(task.name)}@${task.version}`, isLast: false });
    }
    for (const app of role.apps) {
      children.push({ label: `app: ${getAppShortName(app.name)}@${app.version}`, isLast: false });
    }
    for (const skill of role.skills) {
      children.push({ label: `skill: ${getAppShortName(skill.name)}@${skill.version}`, isLast: false });
    }

    if (children.length > 0) {
      children[children.length - 1].isLast = true;
    }

    for (const child of children) {
      const cPrefix = child.isLast ? "└── " : "├── ";
      console.log(`${childPrefix}${cPrefix}${child.label}`);
    }
  }
}
