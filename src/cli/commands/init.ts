import type { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";

interface InitOptions {
  name?: string;
}

const WORKSPACE_DIRS = ["apps", "tasks", "skills", "roles", "agents", ".forge"];

const ENV_EXAMPLE = `# Credential bindings for forge agent deployments
# Copy this file to .env and fill in your values
# NEVER commit .env files to version control

# GITHUB_TOKEN=
# ANTHROPIC_API_KEY=
# OPENAI_API_KEY=
# SLACK_BOT_TOKEN=
`;

const GITIGNORE = `node_modules/
dist/
.env
.forge/.env
`;

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize a new forge workspace")
    .option("--name <name>", "Set the workspace package name")
    .action(async (options: InitOptions) => {
      await runInit(process.cwd(), options);
    });
}

export async function runInit(
  targetDir: string,
  options: InitOptions,
): Promise<void> {
  const forgeDir = path.join(targetDir, ".forge");

  // Idempotency check
  if (fs.existsSync(forgeDir)) {
    console.log(
      "⚠ Workspace already initialized (.forge/ directory exists). Nothing to do.",
    );
    return;
  }

  const created: string[] = [];

  // Create workspace directories
  for (const dir of WORKSPACE_DIRS) {
    const dirPath = path.join(targetDir, dir);
    fs.mkdirSync(dirPath, { recursive: true });
    created.push(`${dir}/`);
  }

  // Generate package.json (only if it doesn't exist)
  const packageJsonPath = path.join(targetDir, "package.json");
  if (fs.existsSync(packageJsonPath)) {
    console.log(
      '⚠ package.json already exists. Skipping generation. Please add "workspaces": ["apps/*", "tasks/*", "skills/*", "roles/*", "agents/*"] manually.',
    );
  } else {
    const workspaceName =
      options.name ?? path.basename(path.resolve(targetDir));
    const packageJson = {
      name: workspaceName,
      version: "0.1.0",
      private: true,
      workspaces: ["apps/*", "tasks/*", "skills/*", "roles/*", "agents/*"],
    };
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n");
    created.push("package.json");
  }

  // Generate .forge/config.json
  const configPath = path.join(forgeDir, "config.json");
  const config = { version: "0.1.0" };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  created.push(".forge/config.json");

  // Generate .forge/.env.example
  const envExamplePath = path.join(forgeDir, ".env.example");
  fs.writeFileSync(envExamplePath, ENV_EXAMPLE);
  created.push(".forge/.env.example");

  // Generate .gitignore (only if it doesn't exist)
  const gitignorePath = path.join(targetDir, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    console.log("⚠ .gitignore already exists. Skipping generation.");
  } else {
    fs.writeFileSync(gitignorePath, GITIGNORE);
    created.push(".gitignore");
  }

  // Success output
  console.log("\n✔ forge workspace initialized!\n");
  console.log("Created:");
  for (const item of created) {
    console.log(`  ${item}`);
  }
  console.log("\nNext steps:");
  console.log("  forge add <package>    Add an agent component");
  console.log("  forge build <agent>    Build and validate an agent");
  console.log("  forge install <agent>  Install and scaffold an agent\n");
}
