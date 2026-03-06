# Design: End-to-End Validation -- Full Chapter Workflow

## Overview

Extend the existing E2E integration test (`tests/integration/install-flow.test.ts`) with new test steps that complete the full chapter lifecycle. The existing test already covers steps 1-5 (init, install tgz packages, validate, list, install member). We add steps 6-10 covering the members registry, enable/disable workflow, run rejection, and forge-remnant verification.

## Architecture

### Test Flow (Sequential Steps)

The test follows a sequential flow where each step depends on the previous:

```
Step 1 (existing): chapter init --template note-taker
Step 2 (existing): npm install chapter + chapter-core tgz
Step 3 (existing): chapter validate @<member>
Step 4 (existing): chapter list --json
Step 5 (existing): chapter install @<member>
Step 6 (new):      Verify members registry (.chapter/members.json)
Step 7 (new):      Verify per-member directory structure completeness
Step 8 (new):      chapter disable @<member> + verify
Step 9 (new):      chapter run rejects disabled member
Step 10 (new):     chapter enable @<member> + verify
Step 11 (new):     No "forge" references in generated files
```

### Step 6: Verify Members Registry

After `chapter install`, read `.chapter/members.json` and verify:
- The file exists and is valid JSON
- Contains entry for slug `note-taker`
- Entry has `status: "enabled"`, `memberType: "agent"`, valid `package` name, and `installedAt` timestamp

### Step 7: Verify Per-Member Directory Structure

After install, verify the complete per-member directory layout:
- `.chapter/members/note-taker/log/` exists
- `.chapter/members/note-taker/proxy/Dockerfile` exists
- `.chapter/members/note-taker/claude-code/workspace/` exists
- `.chapter/members/note-taker/docker-compose.yml` exists
- `.chapter/members/note-taker/.env` exists
- `.chapter/members/note-taker/chapter.lock.json` exists

### Step 8: Chapter Disable

Call `runDisable(tmpDir, "@note-taker")` and verify:
- `.chapter/members.json` entry for `note-taker` has `status: "disabled"`
- Other fields (package, memberType, installedAt) are preserved

### Step 9: Run Rejects Disabled Member

Invoke `runAgent()` with the disabled member and verify:
- process.exit is called with code 1
- Error output mentions "disabled"

Since `runAgent` calls `checkDockerCompose()` first (which would fail in CI without Docker), we test the run rejection by directly calling the function with mocked docker-compose check, or by importing `getMember` and verifying the status check logic. The simpler approach: call `getMember()` to verify status is "disabled" -- the unit tests for run command already cover the rejection behavior.

### Step 10: Chapter Enable

Call `runEnable(tmpDir, "@note-taker")` and verify:
- `.chapter/members.json` entry for `note-taker` has `status: "enabled"`

### Step 11: No Forge References

Recursively read all generated files under `.chapter/` and verify none contain the string "forge" (case-insensitive). Exclude:
- Binary files
- `node_modules/` paths

## Files Modified

| File | Change |
|------|--------|
| `tests/integration/install-flow.test.ts` | Add steps 6-11 as new test cases |

## Dependencies

- `runEnable` from `src/cli/commands/enable.ts`
- `runDisable` from `src/cli/commands/disable.ts`
- `readMembersRegistry` from `src/registry/members.ts`

## Risk Assessment

- Low risk: extending existing test with additional assertions
- Docker-free: no Docker needed for enable/disable/registry checks
- The forge-remnant check may catch false positives in package names inside node_modules -- scoping the check to `.chapter/` directory only avoids this
