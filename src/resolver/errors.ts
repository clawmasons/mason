/**
 * Thrown when a required package is not found in the discovery map.
 */
export class PackageNotFoundError extends Error {
  constructor(
    public readonly packageName: string,
    public readonly context?: string,
  ) {
    const msg = context
      ? `Package "${packageName}" not found (required by ${context})`
      : `Package "${packageName}" not found`;
    super(msg);
    this.name = "PackageNotFoundError";
  }
}

/**
 * Thrown when a package's forge field is invalid or cannot be parsed.
 */
export class InvalidForgeFieldError extends Error {
  constructor(
    public readonly packageName: string,
    public readonly reason: string,
  ) {
    super(`Invalid forge field in package "${packageName}": ${reason}`);
    this.name = "InvalidForgeFieldError";
  }
}

/**
 * Thrown when a circular dependency is detected in the task graph.
 */
export class CircularDependencyError extends Error {
  constructor(public readonly cyclePath: string[]) {
    super(`Circular dependency detected: ${cyclePath.join(" → ")}`);
    this.name = "CircularDependencyError";
  }
}

/**
 * Thrown when a dependency has the wrong forge type (e.g., agent.roles
 * references an app instead of a role).
 */
export class TypeMismatchError extends Error {
  constructor(
    public readonly packageName: string,
    public readonly expectedType: string,
    public readonly actualType: string,
    public readonly context?: string,
  ) {
    const msg = context
      ? `Package "${packageName}" has type "${actualType}" but expected "${expectedType}" (referenced by ${context})`
      : `Package "${packageName}" has type "${actualType}" but expected "${expectedType}"`;
    super(msg);
    this.name = "TypeMismatchError";
  }
}
