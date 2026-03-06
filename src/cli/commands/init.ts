import type { Command } from "commander";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export interface InitOptions {
  name?: string;
  template?: string;
}

const WORKSPACE_DIRS = ["apps", "tasks", "skills", "roles", "agents", ".chapter"];

const ENV_EXAMPLE = `# Credential bindings for chapter member deployments
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
.chapter/.env
`;

/**
 * Resolve the chapter project root directory (where package.json, src/, bin/ live).
 * The templates/ directory lives at the project root.
 */
function getChapterProjectRoot(): string {
  // This file is at src/cli/commands/init.ts (or dist/cli/commands/init.js)
  // The project root is 3 levels up from the file's directory.
  const thisFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(thisFile), "..", "..", "..");
}

/**
 * Get the path to the templates directory inside the forge package.
 */
export function getTemplatesDir(): string {
  return path.join(getChapterProjectRoot(), "templates");
}

/**
 * List available template names by reading subdirectories of the templates/ directory.
 */
export function listTemplates(templatesDir?: string): string[] {
  const dir = templatesDir ?? getTemplatesDir();
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/**
 * Derive the project scope from a --name value or directory basename.
 *
 * - "@acme/my-agent" -> "acme"
 * - "test-forge" -> "test-forge"
 * - "@myorg/cool-project" -> "myorg"
 */
export function deriveProjectScope(nameOrDir: string): string {
  if (nameOrDir.startsWith("@") && nameOrDir.includes("/")) {
    // Scoped package: extract the scope without the @
    return nameOrDir.slice(1, nameOrDir.indexOf("/"));
  }
  return nameOrDir;
}

/**
 * Recursively copy template files from srcDir to destDir.
 * Performs {{projectName}} and {{projectScope}} placeholder substitution
 * in package.json files.
 */
export function copyTemplateFiles(
  srcDir: string,
  destDir: string,
  projectName: string,
  projectScope: string,
): void {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyTemplateFiles(srcPath, destPath, projectName, projectScope);
    } else {
      let content = fs.readFileSync(srcPath, "utf-8");

      // Perform placeholder substitution in package.json files
      if (entry.name === "package.json") {
        content = content.replace(/\{\{projectName\}\}/g, projectName);
        content = content.replace(/\{\{projectScope\}\}/g, projectScope);
      }

      fs.writeFileSync(destPath, content);
    }
  }
}

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize a new forge workspace")
    .option("--name <name>", "Set the workspace package name")
    .option("--template <template>", "Use a project template")
    .action(async (options: InitOptions) => {
      await runInit(process.cwd(), options);
    });
}

export async function runInit(
  targetDir: string,
  options: InitOptions,
  deps?: { templatesDir?: string; skipNpmInstall?: boolean },
): Promise<void> {
  const chapterDir = path.join(targetDir, ".chapter");

  // Idempotency check
  if (fs.existsSync(chapterDir)) {
    console.log(
      "⚠ Workspace already initialized (.chapter/ directory exists). Nothing to do.",
    );
    return;
  }

  // Determine project name and scope
  const projectName = options.name ?? path.basename(path.resolve(targetDir));
  const projectScope = deriveProjectScope(projectName);

  // Resolve templates directory
  const templatesDir = deps?.templatesDir ?? getTemplatesDir();

  // If no template specified, list available templates
  if (!options.template) {
    const templates = listTemplates(templatesDir);
    if (templates.length > 0) {
      console.log("\nAvailable templates:");
      for (const t of templates) {
        console.log(`  ${t}`);
      }
      console.log(
        "\nUse --template <name> to initialize from a template.",
      );
      console.log("Proceeding with empty workspace scaffold...\n");
    }
  }

  // If template specified, validate and copy template files
  let usedTemplate = false;
  if (options.template) {
    const templateDir = path.join(templatesDir, options.template);
    if (!fs.existsSync(templateDir)) {
      const available = listTemplates(templatesDir);
      const listStr =
        available.length > 0
          ? `Available templates: ${available.join(", ")}`
          : "No templates available.";
      console.error(
        `✘ Unknown template "${options.template}". ${listStr}`,
      );
      process.exit(1);
      return;
    }

    // Copy template files to target directory
    copyTemplateFiles(templateDir, targetDir, projectName, projectScope);
    usedTemplate = true;
  }

  const created: string[] = [];

  // Create workspace directories (may already exist from template)
  for (const dir of WORKSPACE_DIRS) {
    const dirPath = path.join(targetDir, dir);
    fs.mkdirSync(dirPath, { recursive: true });
    created.push(`${dir}/`);
  }

  // Generate package.json (only if it doesn't exist -- template may have provided one)
  const packageJsonPath = path.join(targetDir, "package.json");
  if (fs.existsSync(packageJsonPath)) {
    if (!usedTemplate) {
      console.log(
        '⚠ package.json already exists. Skipping generation. Please add "workspaces": ["apps/*", "tasks/*", "skills/*", "roles/*", "agents/*"] manually.',
      );
    }
  } else {
    const packageJson = {
      name: projectName,
      version: "0.1.0",
      private: true,
      workspaces: ["apps/*", "tasks/*", "skills/*", "roles/*", "agents/*"],
    };
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n");
    created.push("package.json");
  }

  // Generate .chapter/config.json
  const configPath = path.join(chapterDir, "config.json");
  const config = { version: "0.1.0" };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  created.push(".chapter/config.json");

  // Generate .chapter/.env.example
  const envExamplePath = path.join(chapterDir, ".env.example");
  fs.writeFileSync(envExamplePath, ENV_EXAMPLE);
  created.push(".chapter/.env.example");

  // Generate .gitignore (only if it doesn't exist)
  const gitignorePath = path.join(targetDir, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    console.log("⚠ .gitignore already exists. Skipping generation.");
  } else {
    fs.writeFileSync(gitignorePath, GITIGNORE);
    created.push(".gitignore");
  }

  // Run npm install after template scaffolding
  if (usedTemplate && !deps?.skipNpmInstall) {
    console.log("\nInstalling dependencies...");
    try {
      execFileSync("npm", ["install"], {
        cwd: targetDir,
        stdio: "inherit",
      });
    } catch {
      console.log(
        "⚠ npm install failed. You can run it manually later.",
      );
    }
  }

  // Success output
  console.log("\n✔ forge workspace initialized!\n");
  console.log("Created:");
  for (const item of created) {
    console.log(`  ${item}`);
  }

  if (usedTemplate) {
    console.log(`\nTemplate: ${options.template}`);
    console.log("\nNext steps:");
    console.log(`  forge list                                    List discovered packages`);
    console.log(`  forge validate @${projectScope}/agent-note-taker   Validate the agent graph`);
    console.log(`  forge install @${projectScope}/agent-note-taker    Install and scaffold the agent\n`);
  } else {
    console.log("\nNext steps:");
    console.log("  forge add <package>    Add an agent component");
    console.log("  forge build <agent>    Build and validate an agent");
    console.log("  forge install <agent>  Install and scaffold an agent\n");
  }
}
