import type { Command } from "commander";
import { discoverPackages } from "../../resolver/discover.js";
import { resolveAgent } from "../../resolver/resolve.js";
import { validateAgent } from "../../validator/validate.js";
import type { ValidationResult } from "../../validator/types.js";

interface ValidateOptions {
  json?: boolean;
}

function formatErrors(result: ValidationResult): string {
  const lines: string[] = [];

  const grouped = new Map<string, typeof result.errors>();
  for (const err of result.errors) {
    const existing = grouped.get(err.category) ?? [];
    existing.push(err);
    grouped.set(err.category, existing);
  }

  for (const [category, errors] of grouped) {
    lines.push(`\n  ${category} (${errors.length}):`);
    for (const err of errors) {
      lines.push(`    - ${err.message}`);
    }
  }

  return lines.join("\n");
}

export function registerValidateCommand(program: Command): void {
  program
    .command("validate")
    .description("Validate an agent's dependency graph and permissions")
    .argument("<agent>", "Agent package name to validate")
    .option("--json", "Output validation result as JSON")
    .action(async (agentName: string, options: ValidateOptions) => {
      await runValidate(process.cwd(), agentName, options);
    });
}

export async function runValidate(
  rootDir: string,
  agentName: string,
  options: ValidateOptions,
): Promise<void> {
  try {
    // Discover packages
    const packages = discoverPackages(rootDir);

    // Resolve agent graph
    const agent = resolveAgent(agentName, packages);

    // Validate
    const result = validateAgent(agent);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.valid) {
      console.log(`\n✔ Agent "${agentName}" is valid.\n`);
      if (result.warnings.length > 0) {
        for (const w of result.warnings) {
          console.warn(`  ⚠ [${w.category}] ${w.message}`);
        }
        console.warn("");
      }
    } else {
      console.error(
        `\n✘ Agent "${agentName}" has ${result.errors.length} validation error(s):${formatErrors(result)}\n`,
      );
    }

    process.exit(result.valid ? 0 : 1);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json) {
      console.log(JSON.stringify({ valid: false, errors: [{ category: "resolution", message, context: {} }] }, null, 2));
    } else {
      console.error(`\n✘ Validation failed: ${message}\n`);
    }
    process.exit(1);
  }
}
