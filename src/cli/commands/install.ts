import type { Command } from "commander";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { discoverPackages } from "../../resolver/discover.js";
import { resolveAgent } from "../../resolver/resolve.js";
import { validateAgent } from "../../validator/validate.js";
import { generateProxyConfig } from "../../generator/proxy-config.js";
import { generateProxyDockerfile } from "../../generator/proxy-dockerfile.js";
import { getAppShortName } from "../../generator/toolfilter.js";
import { claudeCodeMaterializer } from "../../materializer/claude-code.js";
import type { RuntimeMaterializer, ComposeServiceDef } from "../../materializer/types.js";
import { generateDockerCompose } from "../../compose/docker-compose.js";
import { generateEnvTemplate } from "../../compose/env.js";
import { generateLockFile } from "../../compose/lock.js";

interface InstallOptions {
  outputDir?: string;
}

/** Registry of runtime name → materializer. */
const materializerRegistry = new Map<string, RuntimeMaterializer>([
  ["claude-code", claudeCodeMaterializer],
]);

export function registerInstallCommand(program: Command): void {
  program
    .command("install")
    .description("Install and scaffold an agent deployment directory")
    .argument("<agent>", "Agent package name to install")
    .option("--output-dir <dir>", "Custom output directory for scaffolded files")
    .action(async (agentName: string, options: InstallOptions) => {
      await runInstall(process.cwd(), agentName, options);
    });
}

export async function runInstall(
  rootDir: string,
  agentName: string,
  options: InstallOptions,
): Promise<void> {
  try {
    // 1. Discover packages
    console.log("Discovering packages...");
    const packages = discoverPackages(rootDir);

    // 2. Resolve agent graph
    console.log("Resolving agent dependency graph...");
    const agent = resolveAgent(agentName, packages);
    const agentShortName = getAppShortName(agent.name);

    // 3. Validate
    console.log("Validating agent graph...");
    const validation = validateAgent(agent);
    if (!validation.valid) {
      const errorLines = validation.errors.map((e) => `  - [${e.category}] ${e.message}`);
      console.error(
        `\n✘ Agent "${agentName}" failed validation with ${validation.errors.length} error(s):\n${errorLines.join("\n")}\n`,
      );
      process.exit(1);
      return;
    }

    // 4. Generate mcp-proxy config
    console.log("Generating mcp-proxy config...");
    const proxyConfig = generateProxyConfig(agent);
    const proxyDockerfile = generateProxyDockerfile(agent);

    // 5. Generate proxy auth token (before materialization so it can be baked in)
    const proxyToken = crypto.randomBytes(32).toString("hex");

    // 6. Materialize runtimes
    const proxyPort = agent.proxy?.port ?? 9090;
    const proxyEndpoint = `http://mcp-proxy:${proxyPort}`;
    const runtimeServices = new Map<string, ComposeServiceDef>();
    const allFiles = new Map<string, string>();
    const skippedRuntimes: string[] = [];

    for (const runtime of agent.runtimes) {
      const materializer = materializerRegistry.get(runtime);
      if (!materializer) {
        skippedRuntimes.push(runtime);
        console.log(`⚠ No materializer registered for runtime "${runtime}" — skipping.`);
        continue;
      }

      console.log(`Materializing ${runtime} workspace...`);

      // Workspace files (pass token so it gets baked into settings)
      const workspace = materializer.materializeWorkspace(agent, proxyEndpoint, proxyToken);
      for (const [relPath, content] of workspace) {
        allFiles.set(`${runtime}/workspace/${relPath}`, content);
      }

      // Dockerfile
      const dockerfile = materializer.generateDockerfile(agent);
      allFiles.set(`${runtime}/Dockerfile`, dockerfile);

      // Config JSON (e.g., .claude.json for OOBE bypass)
      if (materializer.generateConfigJson) {
        allFiles.set(`${runtime}/.claude.json`, materializer.generateConfigJson());
      }

      // Compose service
      const service = materializer.generateComposeService(agent);
      runtimeServices.set(runtime, service);
    }

    // 6. Generate proxy config file
    allFiles.set("mcp-proxy/config.json", JSON.stringify(proxyConfig, null, 2));
    if (proxyDockerfile !== null) {
      allFiles.set("mcp-proxy/Dockerfile", proxyDockerfile);
    }

    // 7. Generate docker-compose.yml
    console.log("Generating docker-compose.yml...");
    const composeYaml = generateDockerCompose(agent, runtimeServices, proxyDockerfile !== null);
    allFiles.set("docker-compose.yml", composeYaml);

    // 8. Generate .env with proxy token
    const envTemplate = generateEnvTemplate(agent);
    const envContent = envTemplate.replace("FORGE_PROXY_TOKEN=", `FORGE_PROXY_TOKEN=${proxyToken}`);
    allFiles.set(".env", envContent);

    // 9. Generate lock file
    const lockFile = generateLockFile(agent, [...allFiles.keys()]);
    allFiles.set("forge.lock.json", JSON.stringify(lockFile, null, 2));

    // 10. Write files to output directory
    const outputDir = options.outputDir
      ? path.resolve(rootDir, options.outputDir)
      : path.join(rootDir, ".forge", "agents", agentShortName);

    console.log(`Writing files to ${outputDir}...`);

    for (const [relPath, content] of allFiles) {
      const fullPath = path.join(outputDir, relPath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);
    }

    // Create empty .claude/ directories for runtimes that generate config JSON
    for (const runtime of agent.runtimes) {
      const materializer = materializerRegistry.get(runtime);
      if (materializer?.generateConfigJson) {
        fs.mkdirSync(path.join(outputDir, runtime, ".claude"), { recursive: true });
      }
    }

    // Success summary
    const materializedRuntimes = agent.runtimes.filter((r) => materializerRegistry.has(r));
    console.log(`\n✔ Agent "${agentName}" installed successfully!\n`);
    console.log(`  Output: ${outputDir}`);
    console.log(`  Files:  ${allFiles.size} generated`);
    console.log(`  Runtimes: ${materializedRuntimes.join(", ")}`);
    if (skippedRuntimes.length > 0) {
      console.log(`  Skipped: ${skippedRuntimes.join(", ")} (no materializer)`);
    }
    const composePath = path.join(outputDir, "docker-compose.yml");
    const runtimeName = materializedRuntimes[0] ?? "claude-code";
    console.log(`\n  Next steps:`);
    console.log(`    1. Fill in app credentials in ${path.join(outputDir, ".env")}`);
    console.log(`    2. Run: forge run ${agentName}`);
    console.log(`       Or manually:`);
    console.log(`         docker compose -f ${composePath} up -d mcp-proxy`);
    console.log(`         docker compose -f ${composePath} run --rm ${runtimeName}`);
    console.log(`    3. On first run, authenticate with: /login\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n✘ Install failed: ${message}\n`);
    process.exit(1);
  }
}
