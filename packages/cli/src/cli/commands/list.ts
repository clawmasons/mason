import type { Command } from "commander";
import { discoverRoles } from "@clawmasons/shared";
import type { Role } from "@clawmasons/shared";

interface ListOptions {
  json?: boolean;
}

export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description("List available roles (local and installed packages)")
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
    // Discover all roles (local + packaged)
    const roles = await discoverRoles(rootDir);

    if (roles.length === 0) {
      console.error("No roles found.");
      process.exit(1);
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(roles, null, 2));
      return;
    }

    // Print role listing
    console.log("\nAvailable roles:\n");
    for (const role of roles) {
      printRole(role);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\nList failed: ${message}\n`);
    process.exit(1);
  }
}

function printRole(role: Role): void {
  const source = role.source.type === "local"
    ? `local, ${role.source.path ?? "unknown"}`
    : `package, ${role.source.packageName ?? "unknown"}`;

  const version = role.metadata.version ?? "0.0.0";
  console.log(`  ${role.metadata.name}@${version} (${source})`);

  if (role.metadata.description) {
    console.log(`    ${role.metadata.description}`);
  }

  const children: string[] = [];

  if (role.tasks.length > 0) {
    children.push(`tasks: ${role.tasks.map((t) => t.name).join(", ")}`);
  }
  if (role.apps.length > 0) {
    children.push(`apps: ${role.apps.map((a) => a.name).join(", ")}`);
  }
  if (role.skills.length > 0) {
    children.push(`skills: ${role.skills.map((s) => s.name).join(", ")}`);
  }

  for (const child of children) {
    console.log(`    ${child}`);
  }

  console.log("");
}
