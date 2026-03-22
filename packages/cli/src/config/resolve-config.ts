import type { AgentConfigSchema, ConfigField, ConfigOption } from "@clawmasons/agent-sdk";

/**
 * Result of resolving an AgentConfigSchema against stored config.
 */
export interface ResolveResult {
  /**
   * Flat map of resolved values keyed as "group.field" (e.g., "llm.provider").
   * Includes both stored values and defaults.
   */
  resolved: Record<string, string>;

  /**
   * Fields that are required but have no stored value and no default.
   * Each entry includes the group key for context (as `groupKey` on the returned object).
   */
  missing: Array<ConfigField & { groupKey: string }>;
}

/**
 * Pure config resolution: walks an AgentConfigSchema and checks each field
 * against stored config. Returns resolved values and a list of missing fields.
 *
 * No I/O, no prompting, no side effects.
 *
 * @param schema       - The agent's declared config schema
 * @param storedConfig - Previously persisted config (from getAgentConfig)
 * @returns Resolved values and missing required fields
 */
export function resolveConfig(
  schema: AgentConfigSchema,
  storedConfig: Record<string, Record<string, string>>,
): ResolveResult {
  const resolved: Record<string, string> = {};
  const missing: Array<ConfigField & { groupKey: string }> = [];

  for (const group of schema.groups) {
    const groupStored = storedConfig[group.key] ?? {};
    // Track intra-group resolved values (bare field keys) for optionsFn
    const intraGroup: Record<string, string> = {};

    for (const field of group.fields) {
      const flatKey = `${group.key}.${field.key}`;
      const storedValue = groupStored[field.key];

      if (storedValue !== undefined) {
        resolved[flatKey] = storedValue;
        intraGroup[field.key] = storedValue;
      } else if (field.default !== undefined) {
        resolved[flatKey] = field.default;
        intraGroup[field.key] = field.default;
      } else {
        const isRequired = field.required !== false; // defaults to true
        if (isRequired) {
          missing.push({ ...field, groupKey: group.key });
        }
        // Optional field without stored value or default — not in resolved, not in missing
      }
    }
  }

  return { resolved, missing };
}

/**
 * Compute the effective options for a field, respecting optionsFn precedence.
 *
 * @param field         - The config field
 * @param intraGroup    - Intra-group resolved values (bare field keys)
 * @returns The options list (may be empty for free-text fields)
 */
export function computeFieldOptions(
  field: ConfigField,
  intraGroup: Record<string, string>,
): ConfigOption[] {
  if (field.optionsFn) {
    return field.optionsFn(intraGroup);
  }
  return field.options ?? [];
}
