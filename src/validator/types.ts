/**
 * Categories of validation errors matching PRD §5.3 checks.
 */
export type ValidationErrorCategory =
  | "requirement-coverage"
  | "tool-existence"
  | "skill-availability"
  | "app-launch-config";

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
  };
}

/**
 * The result of validating a resolved agent graph.
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
