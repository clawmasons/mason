import type { Command } from "commander";
import { resolveRole, RoleDiscoveryError, adaptRoleToResolvedAgent } from "@clawmasons/shared";
import type { ValidationResult } from "../../validator/types.js";

interface ValidateOptions {
  json?: boolean;
  /** Validate a role definition instead of an agent package */
  role?: string;
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
    .description("Validate a role definition or agent dependency graph")
    .argument("[name]", "Role name or agent package name to validate")
    .option("--role <name>", "Validate a role definition by name")
    .option("--json", "Output validation result as JSON")
    .action(async (positionalName: string | undefined, options: ValidateOptions) => {
      const roleName = options.role ?? positionalName;
      if (!roleName) {
        console.error("\n  A role or agent name is required.\n  Usage: mason chapter validate <name>\n         mason chapter validate --role <name>\n");
        process.exit(1);
        return;
      }

      // Try role-based validation first
      await runValidate(process.cwd(), roleName, options);
    });
}

export async function runValidate(
  rootDir: string,
  name: string,
  options: ValidateOptions,
): Promise<void> {
  try {
    // Validate as a role
    const roleResult = await tryValidateRole(rootDir, name);
    if (roleResult) {
      if (options.json) {
        console.log(JSON.stringify(roleResult, null, 2));
      } else if (roleResult.valid) {
        console.log(`\nRole "${name}" is valid.\n`);
        if (roleResult.warnings.length > 0) {
          for (const w of roleResult.warnings) {
            console.warn(`  [${w.category}] ${w.message}`);
          }
          console.warn("");
        }
      } else {
        console.error(
          `\nRole "${name}" has ${roleResult.errors.length} validation error(s):${formatErrors(roleResult)}\n`,
        );
      }
      process.exit(roleResult.valid ? 0 : 1);
      return;
    }

    // Role not found
    throw new RoleDiscoveryError(`Role "${name}" not found. Make sure it exists as a local ROLE.md or installed package.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Provide install instructions for package-like references
    const isPackageRef = name.includes("/") || name.startsWith("@");
    const installHint = isPackageRef
      ? `\n  To install: npm install --save-dev ${name}`
      : "";

    if (error instanceof RoleDiscoveryError || isPackageRef) {
      if (options.json) {
        console.log(JSON.stringify({
          valid: false,
          errors: [{
            category: "resolution",
            message: message + installHint,
            context: {},
          }],
        }, null, 2));
      } else {
        console.error(`\nError: ${message}${installHint}\n`);
      }
      process.exit(1);
      return;
    }

    if (options.json) {
      console.log(JSON.stringify({ valid: false, errors: [{ category: "resolution", message, context: {} }] }, null, 2));
    } else {
      console.error(`\nValidation failed: ${message}\n`);
    }
    process.exit(1);
  }
}

/**
 * Attempt to validate a role definition. Returns a validation result if the
 * role is found, or null if it's not found as a role (caller should try agent).
 */
async function tryValidateRole(
  rootDir: string,
  name: string,
): Promise<ValidationResult | null> {
  try {
    const role = await resolveRole(name, rootDir);

    // Validate by doing the adapter round-trip
    const errors: ValidationResult["errors"] = [];
    const warnings: ValidationResult["warnings"] = [];

    // Check required fields
    if (!role.metadata.name) {
      errors.push({ category: "requirement-coverage", message: "Role name is required", context: {} });
    }
    if (!role.metadata.description) {
      warnings.push({ category: "credential-coverage", message: "Role description is recommended", context: {} });
    }

    // Try adapter round-trip to detect structural issues
    try {
      // Use a default agent type for validation
      const agentType = role.source.agentDialect ?? "claude-code-agent";
      adaptRoleToResolvedAgent(role, agentType);
    } catch (err) {
      errors.push({
        category: "app-launch-config",
        message: `Adapter conversion failed: ${err instanceof Error ? err.message : String(err)}`,
        context: {},
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  } catch (err) {
    if (err instanceof RoleDiscoveryError) {
      return null; // Not found as a role — let caller try agent
    }
    throw err;
  }
}
