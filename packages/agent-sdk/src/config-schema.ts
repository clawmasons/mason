import type { ResolvedAgent } from "@clawmasons/shared";

// ── Config Schema Types (PRD §4.2) ─────────────────────────────────────

/**
 * Top-level configuration schema declared by an agent package.
 */
export interface AgentConfigSchema {
  /** Ordered groups of related configuration fields. */
  groups: ConfigGroup[];
}

/**
 * A logical grouping of configuration fields (e.g., "LLM Settings").
 */
export interface ConfigGroup {
  /** Machine-readable key used as the storage namespace (e.g., "llm"). */
  key: string;
  /** Human-readable label shown during prompting (e.g., "LLM Settings"). */
  label: string;
  /** Ordered fields within this group. Resolved in declaration order. */
  fields: ConfigField[];
}

/**
 * A single configuration field the CLI prompts for.
 */
export interface ConfigField {
  /** Machine-readable key used for storage (e.g., "provider"). */
  key: string;
  /** Human-readable prompt label (e.g., "LLM Provider"). */
  label: string;
  /** Explanatory text shown below the prompt. */
  hint?: string;
  /** Whether this field must be provided. Defaults to true. */
  required?: boolean;
  /** Default value if the user presses Enter without typing. */
  default?: string;
  /**
   * Static list of options for a select prompt.
   * When present, the CLI renders a select list instead of free-text input.
   */
  options?: ConfigOption[];
  /**
   * Dynamic options computed from previously resolved fields in this group.
   * Receives a map of { fieldKey: resolvedValue } for all fields resolved
   * so far (declaration order). Returns options for this field.
   *
   * When both `options` and `optionsFn` are present, `optionsFn` takes precedence.
   */
  optionsFn?: (resolved: Record<string, string>) => ConfigOption[];
}

/**
 * A selectable option for a configuration field.
 */
export interface ConfigOption {
  /** Display label shown in the select list. */
  label: string;
  /** Stored value when selected. */
  value: string;
  /** Optional description shown alongside the label. */
  description?: string;
}

// ── Credential Requirement Types ────────────────────────────────────────

/**
 * A credential requirement declared by an agent package via `credentialsFn`.
 *
 * This type mirrors the relevant fields of `CredentialConfig` from agent-entry
 * but lives in agent-sdk to avoid a dependency on agent-entry.
 * The CLI maps these to runtime `CredentialConfig` during config resolution.
 */
export interface AgentCredentialRequirement {
  /** Credential key to request from the credential service. */
  key: string;
  /** How to install the credential: "env" sets it as an env var, "file" writes to a path. */
  type: "env" | "file";
  /** File path to write the credential value to (required when type is "file"). */
  path?: string;
  /** Human-readable label displayed during prompting (e.g., "OpenRouter API Key"). */
  label?: string;
  /** URL where the user can obtain or manage this credential. */
  obtainUrl?: string;
  /** Hint text describing expected format (e.g., "Starts with sk-or-v1-..."). */
  hint?: string;
}

// ── Validation Types ────────────────────────────────────────────────────

/**
 * A validation error returned by an agent's `validate` function.
 *
 * Structurally compatible with the CLI's `ValidationError` but uses
 * wider types (string instead of string unions) so agent packages
 * don't need to import CLI-specific categories.
 */
export interface AgentValidationError {
  /** Error category (e.g., "llm-config", "requirement-coverage"). */
  category: string;
  /** Human-readable error message. */
  message: string;
  /** Structured context for the error. */
  context: Record<string, string | undefined>;
}

/**
 * A validation warning returned by an agent's `validate` function.
 */
export interface AgentValidationWarning {
  /** Warning category (e.g., "llm-config", "credential-coverage"). */
  category: string;
  /** Human-readable warning message. */
  message: string;
  /** Structured context for the warning. */
  context: Record<string, string | undefined>;
}

/**
 * The result of an agent's `validate` function.
 */
export interface AgentValidationResult {
  errors: AgentValidationError[];
  warnings: AgentValidationWarning[];
}

// Re-export ResolvedAgent for use in validate signatures
export type { ResolvedAgent };
