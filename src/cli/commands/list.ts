import type { Command } from "commander";
import { discoverPackages } from "../../resolver/discover.js";
import { resolveAgent } from "../../resolver/resolve.js";
import type { ResolvedAgent, ResolvedRole } from "../../resolver/types.js";
import { getAppShortName } from "../../generator/toolfilter.js";

interface ListOptions {
  json?: boolean;
}

export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description("List installed agents and their dependency trees")
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

    // 2. Find all agent packages
    const agentNames: string[] = [];
    for (const [name, pkg] of packages) {
      if (pkg.forgeField.type === "agent") {
        agentNames.push(name);
      }
    }

    if (agentNames.length === 0) {
      console.error("No agents found.");
      process.exit(1);
      return;
    }

    // 3. Resolve each agent
    const agents: ResolvedAgent[] = [];
    for (const name of agentNames.sort()) {
      agents.push(resolveAgent(name, packages));
    }

    if (options.json) {
      console.log(JSON.stringify(agents, null, 2));
      return;
    }

    // 4. Print tree for each agent
    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];
      if (i > 0) console.log("");
      console.log(`${agent.name}@${agent.version}`);
      printRoles(agent.roles);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n✘ List failed: ${message}\n`);
    process.exit(1);
  }
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
