## Why

The LLM configuration schema (Change #1) added an optional `llm` field to agent members, but there are no validation rules enforcing correct usage. Specifically:

1. **Pi-coding-agent requires `llm`**: Pi is provider-agnostic and has no default LLM. If a member declares `runtimes: ["pi-coding-agent"]` without an `llm` field, the materializer will fail at runtime with an opaque error. Catching this at validation time gives the user a clear, actionable error message.

2. **Claude Code ignores `llm`**: Claude Code only supports Anthropic's API. If a member declares `llm` on a `claude-code` runtime, the field is silently ignored. A warning at validation time tells the user the field has no effect, avoiding confusion about why their model override isn't working.

Without these rules, the `llm` field is structurally valid but semantically unvalidated -- a gap between what the schema allows and what the runtimes actually support.

## What Changes

- **Validator types** (`src/validator/types.ts`):
  - Add `"llm-config"` to `ValidationErrorCategory`
  - Add `ValidationWarning` interface (new concept -- the validator currently only has errors)
  - Add `warnings: ValidationWarning[]` to `ValidationResult`

- **Validator logic** (`src/validator/validate.ts`):
  - Add `checkLlmConfig()` function that inspects `member.runtimes` and `member.llm`
  - Call `checkLlmConfig()` from `validateMember()` alongside existing checks
  - Return both errors and warnings in the result

- **Validator exports** (`src/validator/index.ts`):
  - Export the new `ValidationWarning` type

- **Tests** (`tests/validator/validate.test.ts`):
  - pi-coding-agent without llm produces error
  - pi-coding-agent with llm produces no error
  - claude-code with llm produces warning
  - claude-code without llm produces no warning
  - Member with both runtimes gets both checks applied

## Capabilities

### New Capabilities
- `llm-config-validation`: Validator checks that LLM configuration is semantically correct for the declared runtimes

### Modified Capabilities
- `validation-result`: ValidationResult now includes warnings alongside errors
- `validation-categories`: New `llm-config` category for LLM-related validation issues

## Impact

- **Modified:** `src/validator/types.ts` -- Add llm-config category, ValidationWarning, warnings array
- **Modified:** `src/validator/validate.ts` -- Add checkLlmConfig function, update validateMember
- **Modified:** `src/validator/index.ts` -- Export new types
- **Modified:** `tests/validator/validate.test.ts` -- Add llm-config validation tests
- **No new dependencies**
