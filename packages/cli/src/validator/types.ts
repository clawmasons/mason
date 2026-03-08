/**
 * Categories of validation errors matching PRD §5.3 checks.
 */
export type ValidationErrorCategory =
  | "requirement-coverage"
  | "tool-existence"
  | "skill-availability"
  | "app-launch-config"
  | "llm-config";

/**
 * A single validation error with category, message, and structured context.
 */
export interface ValidationError {
  category: ValidationErrorCategory;
  message: string;
  context: {
    role?: string;
    task?: string;
    app?: string;
    tool?: string;
    skill?: string;
    field?: string;
    agent?: string;
    runtime?: string;
  };
}

/**
 * Categories of validation warnings.
 */
export type ValidationWarningCategory = "llm-config";

/**
 * A single validation warning with category, message, and structured context.
 * Warnings are informational — they do not affect the `valid` flag.
 */
export interface ValidationWarning {
  category: ValidationWarningCategory;
  message: string;
  context: {
    agent?: string;
    runtime?: string;
  };
}

/**
 * The result of validating a resolved agent graph.
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}
