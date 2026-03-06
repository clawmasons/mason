## Architecture

This change adds LLM configuration validation rules to the existing validator. It also introduces the concept of **warnings** to the validation system, since the `claude-code + llm` case is not an error (install should proceed) but the user should be informed the field will be ignored.

### Warnings Support (`src/validator/types.ts`)

The validator currently only produces errors. This change adds a parallel `warnings` array:

```typescript
export interface ValidationWarning {
  category: ValidationWarningCategory;
  message: string;
  context: Record<string, string | undefined>;
}

export type ValidationWarningCategory = "llm-config";

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];  // NEW
}
```

**Design decision:** Warnings do NOT affect `valid`. A member with 0 errors and N warnings is still `valid: true`. This ensures that `chapter install` proceeds when `llm` is present on a `claude-code` member -- the user sees the warning but the install completes.

The `context` on `ValidationWarning` uses a flat `Record<string, string | undefined>` to keep it simple and consistent with `ValidationError`'s context shape. The `member` field identifies which member the warning applies to.

### LLM Config Check (`src/validator/validate.ts`)

A new `checkLlmConfig()` function is added:

```typescript
function checkLlmConfig(
  member: ResolvedMember,
  errors: ValidationError[],
  warnings: ValidationWarning[],
): void {
  // Only applies to agent members (humans don't have runtimes or llm)
  if (member.memberType !== "agent") return;

  const hasPi = member.runtimes.includes("pi-coding-agent");
  const hasClaude = member.runtimes.includes("claude-code");
  const hasLlm = member.llm !== undefined;

  // Pi requires LLM config -- it has no default provider
  if (hasPi && !hasLlm) {
    errors.push({
      category: "llm-config",
      message: `Member "${member.memberName}" uses runtime "pi-coding-agent" but has no "llm" configuration. Pi requires explicit provider and model.`,
      context: { member: member.name, runtime: "pi-coding-agent" },
    });
  }

  // Claude Code ignores LLM config -- it only uses Anthropic
  if (hasClaude && hasLlm) {
    warnings.push({
      category: "llm-config",
      message: `Member "${member.memberName}" uses runtime "claude-code" with an "llm" configuration. Claude Code only supports Anthropic -- the "llm" field will be ignored.`,
      context: { member: member.name, runtime: "claude-code" },
    });
  }
}
```

**Key behaviors:**
- A member with `runtimes: ["pi-coding-agent"]` and no `llm` gets an **error** (blocks install).
- A member with `runtimes: ["claude-code"]` and `llm` present gets a **warning** (install proceeds).
- A member with `runtimes: ["pi-coding-agent"]` and valid `llm` gets neither error nor warning.
- A member with `runtimes: ["claude-code"]` and no `llm` gets neither error nor warning (default behavior).
- A member with both runtimes: pi-coding-agent check triggers if llm missing (error), claude-code check triggers if llm present (warning). With `llm` present, only the claude-code warning fires. Without `llm`, only the pi-coding-agent error fires.
- Human members are skipped entirely -- they have no runtimes or LLM config.

### Integration into `validateMember()`

The function signature does not change (still takes `ResolvedMember`, returns `ValidationResult`). Internally:

```typescript
export function validateMember(member: ResolvedMember): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // ... existing checks (unchanged) ...

  // LLM config validation
  checkLlmConfig(member, errors, warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
```

### Caller Impact

Three CLI commands consume `validateMember()`:

1. **`validate` command** (`src/cli/commands/validate.ts`): Updated to display warnings after errors/success. Warnings do not change the exit code.

2. **`build` command** (`src/cli/commands/build.ts`): Updated to log warnings (if any) before proceeding. Build does not fail on warnings.

3. **`install` command** (`src/cli/commands/install.ts`): Updated to log warnings (if any) before proceeding. Install does not fail on warnings.

The pattern for all three callers is the same:
```typescript
if (validation.warnings.length > 0) {
  for (const w of validation.warnings) {
    console.warn(`  ⚠ [${w.category}] ${w.message}`);
  }
}
```

### Export Updates

`src/validator/index.ts` exports the new types:
```typescript
export type { ValidationWarning, ValidationWarningCategory } from "./types.js";
```

`src/index.ts` re-exports them:
```typescript
export { type ValidationWarning, type ValidationWarningCategory } from "./validator/index.js";
```

## Decisions

1. **Warnings are a new concept**: The validator previously only had errors. Adding warnings as a separate array (rather than a severity level on errors) keeps the API backward-compatible -- existing code that checks `result.errors` continues to work without changes.

2. **`valid` ignores warnings**: `valid` is still `errors.length === 0`. This is the least-surprise behavior: warnings are informational, not blocking.

3. **Category-based, not severity-based**: Both errors and warnings have categories. The `llm-config` category appears in both `ValidationErrorCategory` and `ValidationWarningCategory`. This keeps the type system precise rather than using a generic severity field.

4. **Human members skipped**: `checkLlmConfig` returns early for human members. This is consistent with the schema design where human members don't have `runtimes` or `llm` fields.

5. **Each runtime checked independently**: If a member has `runtimes: ["pi-coding-agent", "claude-code"]` with `llm` present, only the claude-code warning fires (pi is satisfied). If `llm` is absent, only the pi error fires (claude-code is fine). The checks are independent, not mutually exclusive.
