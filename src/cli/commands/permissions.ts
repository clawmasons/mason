import type { Command } from "commander";
import { discoverPackages } from "../../resolver/discover.js";
import { resolveMember } from "../../resolver/resolve.js";
import { computeToolFilters } from "../../generator/toolfilter.js";
import { getAppShortName } from "../../generator/toolfilter.js";

interface PermissionsOptions {
  json?: boolean;
}

interface PermissionsOutput {
  roles: Record<string, Record<string, { allow: string[]; deny: string[] }>>;
  toolFilters: Record<string, { mode: string; list: string[] }>;
}

export function registerPermissionsCommand(program: Command): void {
  program
    .command("permissions")
    .description("Display the resolved permission matrix and toolFilter for a member")
    .argument("<member>", "Member package name")
    .option("--json", "Output as JSON")
    .action(async (memberName: string, options: PermissionsOptions) => {
      await runPermissions(process.cwd(), memberName, options);
    });
}

export async function runPermissions(
  rootDir: string,
  memberName: string,
  options: PermissionsOptions,
): Promise<void> {
  try {
    // 1. Discover and resolve
    const packages = discoverPackages(rootDir);
    const member = resolveMember(memberName, packages);

    // 2. Compute toolFilters
    const toolFilters = computeToolFilters(member);

    if (options.json) {
      const output: PermissionsOutput = {
        roles: {},
        toolFilters: {},
      };

      for (const role of member.roles) {
        output.roles[role.name] = role.permissions;
      }

      for (const [appName, filter] of toolFilters) {
        output.toolFilters[appName] = filter;
      }

      console.log(JSON.stringify(output, null, 2));
      return;
    }

    // 3. Print per-role breakdown
    console.log(`\nPermissions for member: ${memberName}\n`);

    for (const role of member.roles) {
      console.log(`  Role: ${getAppShortName(role.name)}`);

      for (const [appName, perms] of Object.entries(role.permissions)) {
        console.log(`    ${getAppShortName(appName)}:`);
        console.log(`      allow: [${perms.allow.join(", ")}]`);
        if (perms.deny.length > 0) {
          console.log(`      deny:  [${perms.deny.join(", ")}]`);
        }
      }
      console.log("");
    }

    // 4. Print proxy-level toolFilter
    console.log("  Proxy toolFilter (union of all roles):");

    for (const [appName, filter] of toolFilters) {
      console.log(`    ${getAppShortName(appName)}: [${filter.list.join(", ")}]`);
    }

    console.log("");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n✘ Permissions failed: ${message}\n`);
    process.exit(1);
  }
}
