## Why

The forge-packaging PRD defines a complete user journey — from `npm pack` to `forge install` — using only local `.tgz` files with zero registry access. Changes 1-5 have implemented all the individual pieces (forge-core package, discovery enhancement, template system, simplified Dockerfile, example removal), but there is no automated test that validates the entire pipeline end-to-end. Without this test, a regression in any single piece could silently break the complete user experience.

This is the final change in the forge-packaging PRD, validating that all prior changes compose correctly into a working end-to-end flow.

## What Changes

- New integration test: `tests/integration/install-flow.test.ts`
- The test exercises the full workflow using locally-packed `.tgz` tarballs:
  1. Build forge (`npm run build`)
  2. Pack forge and forge-core into `.tgz` files via `npm pack`
  3. Create a temporary directory
  4. Install both tgz files into the temp directory
  5. Run `forge init --template note-taker`
  6. Run `forge validate @test-forge/agent-note-taker` (project name derived from folder)
  7. Run `forge list`
  8. Run `forge install @test-forge/agent-note-taker`
  9. Verify the generated Dockerfile is single-stage (no `AS builder`)
  10. Clean up temp directory

## Capabilities

### New Capabilities
- `e2e-install-flow`: An integration test spec defining the end-to-end install flow test that validates the complete forge packaging pipeline using local tgz files.

### Modified Capabilities
_(none — this is a test-only change that validates existing functionality)_

## Impact

- **New file**: `tests/integration/install-flow.test.ts` (~150-200 lines)
- **No source code changes**: This change only adds a test
- **CI time**: The test requires `npm run build` + `npm pack` + `npm install` in a temp directory, so it will add ~30-60 seconds to CI runs. It should be tagged as an integration test.
- **Existing tests**: No changes to existing tests
