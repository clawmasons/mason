# Design: `chapter enable` / `chapter disable` Commands

## Architecture

Both commands follow the same pattern:
1. Parse the member slug from the CLI argument (strip leading `@` if present)
2. Determine the `.chapter/` directory path
3. Call `updateMemberStatus()` from the existing registry module
4. Print success or error message

The registry module (`src/registry/members.ts`) already provides `updateMemberStatus(chapterDir, slug, status)` which:
- Reads `.chapter/members.json`
- Finds the member by slug
- Updates the status field
- Writes back the file
- Throws if the slug is not found

No new registry functions are needed.

## Slug Resolution

The CLI argument accepts the member identifier with an optional `@` prefix. The slug is derived by stripping the `@` prefix:
- `@note-taker` -> `note-taker`
- `note-taker` -> `note-taker`

This is consistent with the PRD examples (`chapter enable @note-taker`) and aligns with how `chapter install` uses `member.slug` for registry entries.

## Enable Command (`src/cli/commands/enable.ts`)

```typescript
export function registerEnableCommand(program: Command): void {
  program
    .command("enable")
    .description("Enable an installed member")
    .argument("<member>", "Member slug to enable (e.g., @note-taker)")
    .action(async (memberArg: string) => {
      runEnable(process.cwd(), memberArg);
    });
}

export function runEnable(rootDir: string, memberArg: string): void {
  const slug = memberArg.replace(/^@/, "");
  const chapterDir = path.join(rootDir, ".chapter");
  try {
    updateMemberStatus(chapterDir, slug, "enabled");
    console.log(`\n✔ Member @${slug} enabled\n`);
  } catch (error) {
    console.error(`\n✘ ${error.message}\n`);
    process.exit(1);
  }
}
```

## Disable Command (`src/cli/commands/disable.ts`)

Same pattern as enable, with `"disabled"` as the target status.

## Run Command Guard (`src/cli/commands/run.ts`)

Add a status check after resolving the member directory but before Docker operations:

```typescript
// After resolving memberDir and before Docker checks:
const slug = getAppShortName(memberName);
const chapterDir = path.join(rootDir, ".chapter");
const memberEntry = getMember(chapterDir, slug);
if (memberEntry && memberEntry.status === "disabled") {
  console.error(`\n✘ Member "${memberName}" is disabled. Run "chapter enable @${slug}" to enable it.\n`);
  process.exit(1);
  return;
}
```

The guard is lenient: if the member is not in the registry at all (e.g., installed before the registry was introduced, or using `--output-dir`), `chapter run` proceeds normally. Only an explicitly `"disabled"` status blocks execution.

## Command Registration

In `src/cli/commands/index.ts`, add:
```typescript
import { registerEnableCommand } from "./enable.js";
import { registerDisableCommand } from "./disable.js";

// In registerCommands():
registerEnableCommand(program);
registerDisableCommand(program);
```

## Testing Strategy

### `tests/cli/enable.test.ts`
- Command registration (registered, has argument)
- `runEnable()` with installed enabled member -> status remains "enabled"
- `runEnable()` with installed disabled member -> status becomes "enabled"
- `runEnable()` with non-installed member -> error + exit(1)
- Success message contains member slug

### `tests/cli/disable.test.ts`
- Command registration (registered, has argument)
- `runDisable()` with installed enabled member -> status becomes "disabled"
- `runDisable()` with installed disabled member -> status remains "disabled"
- `runDisable()` with non-installed member -> error + exit(1)
- Success message contains member slug

### `tests/cli/run.test.ts` (additions)
- `runAgent()` with disabled member -> error + exit(1)
- `runAgent()` with enabled member -> proceeds normally
- `runAgent()` with member not in registry -> proceeds normally (lenient)

## Specs Affected

- **New spec:** `enable-disable-commands/spec.md` -- new spec for the enable/disable commands
- **Updated:** `run-command/spec.md` -- add requirement for disabled member rejection
- **Updated:** `members-registry/spec.md` -- add note about CLI consumers of updateMemberStatus
- **Updated:** `cli-framework/spec.md` -- add enable/disable to registered commands list
