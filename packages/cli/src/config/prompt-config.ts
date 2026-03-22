import type { AgentConfigSchema, ConfigField, ConfigOption } from "@clawmasons/agent-sdk";
import { resolveConfig, computeFieldOptions } from "./resolve-config.js";

/**
 * Injectable prompt function. Tests supply a mock; production uses readline.
 *
 * @param field   - The field being prompted for
 * @param options - Computed options (empty array for free-text input)
 * @returns The user's answer (the selected option's value or free-text input)
 */
export type PromptFn = (field: ConfigField, options: ConfigOption[]) => Promise<string>;

/**
 * Result of interactive config prompting.
 */
export interface PromptConfigResult {
  /**
   * Flat map of all resolved values keyed as "group.field".
   * Includes stored values, defaults, and newly prompted values.
   */
  resolved: Record<string, string>;

  /**
   * Newly prompted values in nested format for saveAgentConfig.
   * Empty object when no prompting was needed.
   */
  newValues: Record<string, Record<string, string>>;
}

/**
 * Error thrown when config resolution fails in non-interactive mode.
 * Contains structured information about missing fields for display.
 */
export class ConfigResolutionError extends Error {
  constructor(
    public readonly agentName: string,
    public readonly missingFields: Array<ConfigField & { groupKey: string }>,
  ) {
    const fieldLines = missingFields
      .map((f) => {
        const key = `${f.groupKey}.${f.key}`;
        const hint = f.hint ? ` (${f.hint})` : "";
        return `  ${key.padEnd(20)} — ${f.label}${hint}`;
      })
      .join("\n");

    const jsonExample = buildJsonExample(agentName, missingFields);

    super(
      `Agent "${agentName}" requires configuration that is not set.\n\n` +
      `Missing values:\n${fieldLines}\n\n` +
      `Set these values by running interactively:\n` +
      `  mason run ${agentName}\n\n` +
      `Or add them to .mason/config.json:\n${jsonExample}`,
    );
    this.name = "ConfigResolutionError";
  }
}

/**
 * Build a JSON example snippet for the error message.
 */
function buildJsonExample(
  agentName: string,
  missingFields: Array<ConfigField & { groupKey: string }>,
): string {
  const groups: Record<string, Record<string, string>> = {};
  for (const field of missingFields) {
    if (!groups[field.groupKey]) {
      groups[field.groupKey] = {};
    }
    groups[field.groupKey][field.key] = "...";
  }

  const obj = {
    agents: {
      [agentName]: {
        config: groups,
      },
    },
  };

  return JSON.stringify(obj, null, 2)
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

/**
 * Resolve and prompt for agent config values.
 *
 * 1. Runs pure resolution against stored config
 * 2. If all fields are resolved, returns immediately (no prompting)
 * 3. In non-interactive mode (no TTY), throws ConfigResolutionError
 * 4. In interactive mode, prompts for each missing field in declaration order
 *
 * @param schema      - The agent's config schema
 * @param storedConfig - Previously persisted config
 * @param agentName   - Canonical agent name (for error messages)
 * @param promptFn    - Injectable prompt function (defaults to readline)
 * @param isTTY       - Override for TTY detection (for testing)
 * @returns Resolved config and newly prompted values
 */
export async function promptConfig(
  schema: AgentConfigSchema,
  storedConfig: Record<string, Record<string, string>>,
  agentName: string,
  promptFn?: PromptFn,
  isTTY?: boolean,
): Promise<PromptConfigResult> {
  const { resolved, missing } = resolveConfig(schema, storedConfig);

  if (missing.length === 0) {
    return { resolved, newValues: {} };
  }

  // Non-interactive mode: report all missing fields
  const isInteractive = isTTY ?? (process.stdout.isTTY === true);
  if (!isInteractive) {
    throw new ConfigResolutionError(agentName, missing);
  }

  // Interactive mode: prompt for each missing field
  const effectivePromptFn = promptFn ?? (await createReadlinePromptFn());
  const newValues: Record<string, Record<string, string>> = {};

  // We need to re-walk the schema in declaration order to prompt correctly,
  // because optionsFn may depend on fields that were just prompted for.
  for (const group of schema.groups) {
    const groupStored = storedConfig[group.key] ?? {};
    const intraGroup: Record<string, string> = {};

    // Rebuild intra-group from already-resolved stored/default values
    for (const field of group.fields) {
      const storedValue = groupStored[field.key];
      if (storedValue !== undefined) {
        intraGroup[field.key] = storedValue;
      } else if (field.default !== undefined) {
        intraGroup[field.key] = field.default;
      }
    }

    for (const field of group.fields) {
      const flatKey = `${group.key}.${field.key}`;

      // Already resolved (stored or default)
      if (resolved[flatKey] !== undefined) {
        continue;
      }

      // This field is missing — prompt for it
      const options = computeFieldOptions(field, intraGroup);
      const answer = await effectivePromptFn(field, options);

      resolved[flatKey] = answer;
      intraGroup[field.key] = answer;

      // Track as new value for persistence
      if (!newValues[group.key]) {
        newValues[group.key] = {};
      }
      newValues[group.key][field.key] = answer;
    }
  }

  return { resolved, newValues };
}

/**
 * Create a readline-based prompt function for production use.
 * Handles select-list (numbered options) and free-text input.
 */
async function createReadlinePromptFn(): Promise<PromptFn> {
  const readline = await import("node:readline");

  return async (field: ConfigField, options: ConfigOption[]): Promise<string> => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      if (options.length > 0) {
        return await promptSelect(rl, field, options);
      }
      return await promptText(rl, field);
    } finally {
      rl.close();
    }
  };
}

/**
 * Display a numbered select list and read the user's choice.
 */
function promptSelect(
  rl: import("node:readline").Interface,
  field: ConfigField,
  options: ConfigOption[],
): Promise<string> {
  return new Promise((resolve) => {
    console.log("");
    console.log(`  ${field.label}`);
    if (field.hint) {
      console.log(`  ${field.hint}`);
    }
    console.log("");

    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const desc = opt.description ? ` — ${opt.description}` : "";
      console.log(`    ${i + 1}) ${opt.label}${desc}`);
    }
    console.log("");

    const ask = (): void => {
      const defaultHint = field.default
        ? ` [default: ${field.default}]`
        : "";
      rl.question(`  Select (1-${options.length})${defaultHint}: `, (answer) => {
        const trimmed = answer.trim();

        // Handle default
        if (trimmed === "" && field.default) {
          resolve(field.default);
          return;
        }

        const num = parseInt(trimmed, 10);
        if (num >= 1 && num <= options.length) {
          resolve(options[num - 1].value);
          return;
        }

        console.log(`  Please enter a number between 1 and ${options.length}.`);
        ask();
      });
    };

    ask();
  });
}

/**
 * Display a free-text prompt and read the user's input.
 */
function promptText(
  rl: import("node:readline").Interface,
  field: ConfigField,
): Promise<string> {
  return new Promise((resolve) => {
    console.log("");
    console.log(`  ${field.label}`);
    if (field.hint) {
      console.log(`  ${field.hint}`);
    }

    const ask = (): void => {
      const defaultHint = field.default
        ? ` [default: ${field.default}]`
        : "";
      rl.question(`  Enter value${defaultHint}: `, (answer) => {
        const trimmed = answer.trim();

        if (trimmed === "" && field.default) {
          resolve(field.default);
          return;
        }

        if (trimmed === "" && field.required !== false) {
          console.log("  A value is required.");
          ask();
          return;
        }

        resolve(trimmed);
      });
    };

    ask();
  });
}
