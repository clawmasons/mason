import type { Command } from "commander";
import { discoverPackages } from "../../resolver/discover.js";
import { resolveMember } from "../../resolver/resolve.js";
import { validateMember } from "../../validator/validate.js";
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
    .description("Validate a member's dependency graph and permissions")
    .argument("<member>", "Member package name to validate")
    .option("--json", "Output validation result as JSON")
    .action(async (memberName: string, options: ValidateOptions) => {
      await runValidate(process.cwd(), memberName, options);
    });
}

export async function runValidate(
  rootDir: string,
  memberName: string,
  options: ValidateOptions,
): Promise<void> {
  try {
    // Discover packages
    const packages = discoverPackages(rootDir);

    // Resolve member graph
    const member = resolveMember(memberName, packages);

    // Validate
    const result = validateMember(member);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.valid) {
      console.log(`\n✔ Member "${memberName}" is valid.\n`);
    } else {
      console.error(
        `\n✘ Member "${memberName}" has ${result.errors.length} validation error(s):${formatErrors(result)}\n`,
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
