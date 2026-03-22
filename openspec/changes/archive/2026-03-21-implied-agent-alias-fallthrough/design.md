## Context

PRD Section 5.2 requires a comprehensive fallthrough chain for the CLI's first positional argument: known commands -> configured aliases -> registered agent types -> error with available options. The pre-parse hook in `commands/index.ts` (lines 44-98) already handles known commands and agent types (built-in via `isKnownAgentType()` and config-declared via `readConfigAgentNames()`). Two pieces are missing:

1. Config-declared **aliases** (from `.mason/config.json` `aliases` section) are not checked.
2. When nothing matches, Commander produces a generic error instead of listing available options.

## Goals / Non-Goals

**Goals:**
- Add config-declared alias names to the shorthand detection set
- Show a helpful error with available commands, agent types, and aliases when nothing matches
- Add unit tests covering the full fallthrough chain
- Preserve existing behavior for known commands and agent types

**Non-Goals:**
- Changing how aliases are resolved once they reach the `run` command (that's handled by `loadConfigAliasEntry`)
- Modifying the agent registry or agent type resolution logic
- Adding integration/e2e tests (those are covered in a separate Change 6)

## Decisions

### D1: Add alias names to isShorthandTarget

**Choice:** Import `readConfigAliasNames` alongside `readConfigAgentNames` and union both sets.

**Rationale:** The existing `isShorthandTarget` function checks `isKnownAgentType(arg) || configAgentNames.has(arg)`. Adding `configAliasNames.has(arg)` extends this naturally. Aliases are treated as shorthand targets because `mason <alias>` should rewrite to `mason run <alias>`, and the `run` command's action handler already knows how to resolve aliases via `loadConfigAliasEntry()`.

### D2: Error message on unknown first argument

**Choice:** When the first argument is not a command, alias, or agent type, print a structured error listing all three categories and exit with code 1.

**Rationale:** The PRD requires this (Section 5.2: "If the argument matches neither a command, alias, nor agent type, the CLI exits with an error listing available commands and agent types"). Using `process.exit(1)` matches the existing error-handling pattern in `run-agent.ts`.

### D3: Place error handling inside the parse hooks

**Choice:** Add an `else` branch to the existing `if (!knownCommands.has(firstArg) && isShorthandTarget(firstArg))` condition.

**Rationale:** The hooks already intercept the first argument. Adding the error case here means unknown arguments are caught before Commander sees them, giving us control over the error format. We only trigger the error when: (a) the arg is not a flag, (b) it's not a known command, and (c) it's not a shorthand target. This avoids interfering with valid Commander-handled flags or commands.

## Implementation

### Code Changes

**`packages/cli/src/cli/commands/index.ts`:**

```typescript
import { readConfigAgentNames, readConfigAliasNames } from "@clawmasons/agent-sdk";
import { getKnownAgentTypeNames } from "./run-agent.js";

// In registerCommands():
const configAgentNames = new Set(readConfigAgentNames(process.cwd()));
const configAliasNames = new Set(readConfigAliasNames(process.cwd()));
installAgentTypeShorthand(program, configAgentNames, configAliasNames);

// In installAgentTypeShorthand():
function installAgentTypeShorthand(
  program: Command,
  configAgentNames: Set<string>,
  configAliasNames: Set<string>,
): void {
  // ... existing getKnownCommandNames ...

  const isShorthandTarget = (arg: string): boolean =>
    isKnownAgentType(arg) || configAgentNames.has(arg) || configAliasNames.has(arg);

  // In each hook (parseAsync and parse), add error handling:
  if (!knownCommands.has(firstArg) && isShorthandTarget(firstArg)) {
    args.splice(userArgStart, 0, "run");
  } else if (!knownCommands.has(firstArg)) {
    const commands = [...knownCommands].sort().join(", ");
    const agents = getKnownAgentTypeNames().join(", ");
    const aliases = [...configAliasNames].sort();
    let msg = `\n  Unknown command "${firstArg}".\n`;
    msg += `  Available commands: ${commands}\n`;
    msg += `  Available agents: ${agents}\n`;
    if (aliases.length > 0) {
      msg += `  Configured aliases: ${aliases.join(", ")}\n`;
    }
    console.error(msg);
    process.exit(1);
    return originalParseAsync(args, parseOptions); // unreachable but satisfies return type
  }
```

### Test Coverage

**`packages/cli/tests/cli/commands-index.test.ts` (new):**

1. **Agent type shorthand:** `mason claude` rewrites to `mason run claude` (verifies existing behavior).
2. **Config agent name shorthand:** A config-declared agent name rewrites to `mason run <name>`.
3. **Config alias shorthand:** A config-declared alias name rewrites to `mason run <alias>`.
4. **Known command not rewritten:** `mason run` stays as `mason run` (not `mason run run`).
5. **Unknown argument error:** An unrecognized first argument produces an error listing commands, agents, and aliases.
6. **Flags not treated as commands:** `mason --help` is not treated as an unknown command.

Tests will mock `readConfigAgentNames`, `readConfigAliasNames`, and `isKnownAgentType` to isolate the shorthand logic.
